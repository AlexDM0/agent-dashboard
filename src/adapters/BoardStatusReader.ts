/**
 * Runs `agent-progress status --json --full` in a project's root and maps what it prints to a verdict; a missing
 * executable, a non-zero exit, a timeout or output that is not the expected JSON is `unreadable`, never a throw.
 */
import {
  closeSync,
  openSync,
  readSync,
  realpathSync
} from 'node:fs';
import { devNull } from 'node:os';

import { environmentCopy }                          from '../shared/Environment.ts';
import { UnknownValueUtil }                         from '../shared/UnknownValueUtil.ts';
import { type BoardSummaryVerdict, boardSummaryOf } from './BoardSummaryMapper.ts';

export interface BoardStatusReadRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  timeoutMilliseconds: number;
}

const STATUS_ARGUMENTS = ['status', '--json', '--full'] as const;

/**
 * Bun would load the project root's `.env` and `bunfig.toml` (its `preload` included) for a script run there, so a
 * Bun script is run by the dashboard's own Bun without them.
 */
const RUNTIME_ISOLATION_ARGUMENTS = ['--no-env-file', `--config=${devNull}`] as const;

/** The CLI walks to this root instead of the working directory when the variable is set, so the child must not inherit it. */
const ROOT_OVERRIDE_VARIABLE = 'AGENT_PROGRESS_ROOT';

const BUN_SHEBANG_PATTERN = /^#!.*\bbun\b/;

const SHEBANG_READ_BYTES = 256;

const REASON_STANDARD_ERROR_LINE_COUNT = 3;

const MILLISECONDS_PER_SECOND = 1000;

interface TextCollection {
  text:   Promise<string>;
  cancel: () => void;
}

function firstMeaningfulLines(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).slice(0, REASON_STANDARD_ERROR_LINE_COUNT).join(' ');
}

function childEnvironment(): Record<string, string> {
  const environment = environmentCopy();
  delete environment[ROOT_OVERRIDE_VARIABLE];
  return environment;
}

function firstLineOf(path: string): string {
  const buffer = Buffer.alloc(SHEBANG_READ_BYTES);
  const descriptor = openSync(path, 'r');
  try {
    const bytesRead = readSync(descriptor, buffer, 0, SHEBANG_READ_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').split('\n')[0] ?? '';
  } finally {
    closeSync(descriptor);
  }
}

/** A file that cannot be read is run as given, so its spawn reports why. */
function statusCommandOf(executable: string, runtimeExecutable: string): string[] {
  try {
    const scriptPath = realpathSync(executable);
    if (BUN_SHEBANG_PATTERN.test(firstLineOf(scriptPath))) return [runtimeExecutable, ...RUNTIME_ISOLATION_ARGUMENTS, scriptPath, ...STATUS_ARGUMENTS];
  } catch {
    // Falls through to running the executable itself.
  }
  return [executable, ...STATUS_ARGUMENTS];
}

/** Read through a reader of its own, so a timeout can cancel it rather than wait for an end a lingering grandchild holds back. */
function collectedTextOf(stream: ReadableStream<Uint8Array>): TextCollection {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const text = (async () => {
    let collected = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return collected + decoder.decode();
      collected += decoder.decode(value, { stream: true });
    }
  })().catch(() => '');
  return {
    text,
    cancel: () => {
      reader.cancel().catch(() => undefined);
    },
  };
}

/** The child leads a process group of its own, so a wrapper's children go with it. */
function killProcessGroup(statusProcess: Bun.Subprocess): void {
  try {
    process.kill(-statusProcess.pid, 'SIGKILL');
  } catch {
    statusProcess.kill('SIGKILL');
  }
}

export async function readBoardStatus(request: BoardStatusReadRequest): Promise<BoardSummaryVerdict> {
  if (request.executable === null) return { kind: 'unreadable', reason: 'agent-progress is not on PATH' };

  let statusProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  try {
    statusProcess = Bun.spawn(statusCommandOf(request.executable, request.runtimeExecutable), {
      cwd:      request.root,
      env:      childEnvironment(),
      stdin:    'ignore',
      stdout:   'pipe',
      stderr:   'pipe',
      detached: true,
    });
  } catch (error) {
    return { kind: 'unreadable', reason: `agent-progress could not be started: ${UnknownValueUtil.errorMessageOf(error)}` };
  }

  const standardOutputCollection = collectedTextOf(statusProcess.stdout);
  const standardErrorCollection = collectedTextOf(statusProcess.stderr);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadlinePassed = new Promise<null>((resolve) => {
    deadlineTimer = setTimeout(() => resolve(null), request.timeoutMilliseconds);
  });
  const finished = await Promise.race([
    Promise.all([standardOutputCollection.text, standardErrorCollection.text, statusProcess.exited]),
    deadlinePassed,
  ]);
  clearTimeout(deadlineTimer);

  if (finished === null) {
    killProcessGroup(statusProcess);
    standardOutputCollection.cancel();
    standardErrorCollection.cancel();
    const seconds = request.timeoutMilliseconds / MILLISECONDS_PER_SECOND;
    return { kind: 'unreadable', reason: `agent-progress status did not finish within ${seconds} s and was stopped` };
  }
  const [standardOutput, standardError, exitCode] = finished;
  if (statusProcess.signalCode !== null) {
    return { kind: 'unreadable', reason: `agent-progress status was stopped by ${statusProcess.signalCode}` };
  }
  if (exitCode !== 0) {
    const detail = firstMeaningfulLines(standardError);
    return { kind: 'unreadable', reason: `agent-progress status exited with code ${exitCode}${detail.length > 0 ? `: ${detail}` : ''}` };
  }

  let document: unknown;
  try {
    document = JSON.parse(standardOutput);
  } catch {
    return { kind: 'unreadable', reason: 'agent-progress status printed output that is not JSON' };
  }
  return boardSummaryOf(document);
}
