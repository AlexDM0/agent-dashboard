/**
 * Runs one agent-progress command in a project's root and reports how it ended; a missing executable, a spawn failure,
 * a timeout or a signal is `failed` with its reason, never a throw. What an exit means is the caller's translation.
 */
import {
  closeSync,
  openSync,
  readSync,
  realpathSync
} from 'node:fs';
import { devNull } from 'node:os';

import { environmentCopy }  from '../shared/Environment.ts';
import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';

export interface AgentProgressRunRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  commandArguments:    readonly string[];
  timeoutMilliseconds: number;
}

export type AgentProgressRunOutcome =
  | { kind: 'exited'; exitCode: number; standardOutput: string; standardError: string }
  | { kind: 'failed'; reason: string };

/**
 * Bun would load the project root's `.env` and `bunfig.toml` (its `preload` included) for a script run there, so a
 * Bun script is run by the dashboard's own Bun without them.
 */
const RUNTIME_ISOLATION_ARGUMENTS = ['--no-env-file', `--config=${devNull}`] as const;

/** The CLI walks to this root instead of the working directory when the variable is set, so the child must not inherit it. */
const ROOT_OVERRIDE_VARIABLE = 'AGENT_PROGRESS_ROOT';

const BUN_SHEBANG_PATTERN = /^#!.*\bbun\b/;

const SHEBANG_READ_BYTES = 256;

const MILLISECONDS_PER_SECOND = 1000;

interface TextCollection {
  text:   Promise<string>;
  cancel: () => void;
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
function commandLineOf(executable: string, runtimeExecutable: string, commandArguments: readonly string[]): string[] {
  try {
    const scriptPath = realpathSync(executable);
    if (BUN_SHEBANG_PATTERN.test(firstLineOf(scriptPath))) return [runtimeExecutable, ...RUNTIME_ISOLATION_ARGUMENTS, scriptPath, ...commandArguments];
  } catch {
    // Falls through to running the executable itself.
  }
  return [executable, ...commandArguments];
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
function killProcessGroup(childProcess: Bun.Subprocess): void {
  try {
    process.kill(-childProcess.pid, 'SIGKILL');
  } catch {
    childProcess.kill('SIGKILL');
  }
}

export async function runAgentProgress(request: AgentProgressRunRequest): Promise<AgentProgressRunOutcome> {
  if (request.executable === null) return { kind: 'failed', reason: 'agent-progress is not on PATH' };
  const commandName = `agent-progress ${request.commandArguments[0] ?? ''}`.trim();

  let childProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  try {
    childProcess = Bun.spawn(commandLineOf(request.executable, request.runtimeExecutable, request.commandArguments), {
      cwd:      request.root,
      env:      childEnvironment(),
      stdin:    'ignore',
      stdout:   'pipe',
      stderr:   'pipe',
      detached: true,
    });
  } catch (error) {
    return { kind: 'failed', reason: `agent-progress could not be started: ${UnknownValueUtil.errorMessageOf(error)}` };
  }

  const standardOutputCollection = collectedTextOf(childProcess.stdout);
  const standardErrorCollection = collectedTextOf(childProcess.stderr);
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadlinePassed = new Promise<null>((resolve) => {
    deadlineTimer = setTimeout(() => resolve(null), request.timeoutMilliseconds);
  });
  const finished = await Promise.race([
    Promise.all([standardOutputCollection.text, standardErrorCollection.text, childProcess.exited]),
    deadlinePassed,
  ]);
  clearTimeout(deadlineTimer);

  if (finished === null) {
    killProcessGroup(childProcess);
    standardOutputCollection.cancel();
    standardErrorCollection.cancel();
    const seconds = request.timeoutMilliseconds / MILLISECONDS_PER_SECOND;
    return { kind: 'failed', reason: `${commandName} did not finish within ${seconds} s and was stopped` };
  }
  const [standardOutput, standardError, exitCode] = finished;
  if (childProcess.signalCode !== null) return { kind: 'failed', reason: `${commandName} was stopped by ${childProcess.signalCode}` };
  return {
    kind: 'exited', exitCode, standardOutput, standardError
  };
}
