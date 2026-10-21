/**
 * The reader's run, through `src/adapters/AgentProgressRun.ts`, is the dashboard's every read, so every way it can go wrong is planted with a
 * fake executable: missing, failing with a stderr, printing non-JSON, overrunning its timeout, a wrapper's child holding
 * the output open past it. A good run proves the arguments, the working directory, that the dashboard's own
 * `AGENT_PROGRESS_ROOT` does not leak into the child, and that a Bun script never loads the root's bunfig or .env.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { environmentCopy }       from '../shared/Environment.ts';
import {
  fakeBunExecutableReportingItsLoadedFiles,
  fakeExecutableFailing,
  fakeExecutablePrinting,
  fakeExecutableReportingItsSurroundings,
  fakeExecutablePrintingText,
  fakeExecutableSleeping,
  fakeExecutableWrappingASleep
} from '../testing/FakeAgentProgressExecutable.ts';
import { createScratchDirectory, removeScratchDirectory } from '../testing/ScratchDirectory.ts';
import { readBoardStatus }                                from './BoardStatusReader.ts';

const GENEROUS_TIMEOUT_MILLISECONDS = 5_000;
const SHORT_TIMEOUT_MILLISECONDS = 200;
const SLEEP_SECONDS = 30;

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('board-status-reader');
});

afterEach(() => removeScratchDirectory(scratchDirectory));

test('a null executable is unreadable, naming PATH', async () => {
  expect(await readBoardStatus({
    executable: null, root: scratchDirectory, timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  }))
    .toEqual({ kind: 'unreadable', reason: 'agent-progress is not on PATH' });
});

test('a good run with the status arguments maps the printed document to a ready board', async () => {
  const documentPath = join(import.meta.dir, 'testing', 'ScratchTrackerStatusDocument.json');
  const verdict = await readBoardStatus({
    executable:          fakeExecutablePrinting(scratchDirectory, documentPath),
    root:                scratchDirectory,
    timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS,
    runtimeExecutable:   process.execPath,
  });
  expect(verdict.kind).toBe('ready');
  expect(verdict.kind === 'ready' ? verdict.board.ticketTotal : 0).toBe(5);
});

// The variable is set on a child process running the reader, since a spec never changes its own environment.
test('the run happens in the project root, without the root override the dashboard may carry', () => {
  const executable = fakeExecutableReportingItsSurroundings(scratchDirectory);
  const root = createScratchDirectory('board-status-root');
  try {
    const readerScript = [
      `import { readBoardStatus } from ${JSON.stringify(join(import.meta.dir, 'BoardStatusReader.ts'))};`,
      `const request = { executable: ${JSON.stringify(executable)}, root: ${JSON.stringify(root)}, timeoutMilliseconds: 5000 };`,
      'const verdict = await readBoardStatus({ ...request, runtimeExecutable: process.execPath });',
      'process.stdout.write(JSON.stringify(verdict));',
    ].join('\n');
    const child = Bun.spawnSync(['bun', '-e', readerScript], {
      env:    { ...environmentCopy(), AGENT_PROGRESS_ROOT: scratchDirectory },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(child.stderr.toString()).toBe('');
    expect(JSON.parse(child.stdout.toString())).toEqual({
      kind:   'unreadable',
      reason: `agent-progress status exited with code 3: directory=${root} root=unset`,
    });
  } finally {
    removeScratchDirectory(root);
  }
});

test('a non-zero exit is unreadable with the exit code and the first meaningful stderr lines', async () => {
  const executable = fakeExecutableFailing(scratchDirectory, '\n\nNo tracker here.\n  Run agent-progress init.\n\nthird\nfourth\n', 2);
  const verdict = await readBoardStatus({
    executable, root: scratchDirectory, timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  });
  expect(verdict).toEqual({ kind: 'unreadable', reason: 'agent-progress status exited with code 2: No tracker here. Run agent-progress init. third' });
});

test('output that is not JSON is unreadable', async () => {
  const executable = fakeExecutablePrintingText(scratchDirectory, 'Example Agency: 3 tickets');
  expect(await readBoardStatus({
    executable, root: scratchDirectory, timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  }))
    .toEqual({ kind: 'unreadable', reason: 'agent-progress status printed output that is not JSON' });
});

test('a run past its timeout is killed and unreadable', async () => {
  const executable = fakeExecutableSleeping(scratchDirectory, SLEEP_SECONDS);
  const startedAt = performance.now();
  const verdict = await readBoardStatus({
    executable, root: scratchDirectory, timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  });
  expect(performance.now() - startedAt).toBeLessThan(GENEROUS_TIMEOUT_MILLISECONDS);
  expect(verdict).toEqual({ kind: 'unreadable', reason: 'agent-progress status did not finish within 0.2 s and was stopped' });
});

test('the timeout bounds the read even when a wrapper\'s child holds the output open', async () => {
  const executable = fakeExecutableWrappingASleep(scratchDirectory, SLEEP_SECONDS);
  const startedAt = performance.now();
  const verdict = await readBoardStatus({
    executable, root: scratchDirectory, timeoutMilliseconds: SHORT_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  });
  expect(performance.now() - startedAt).toBeLessThan(GENEROUS_TIMEOUT_MILLISECONDS);
  expect(verdict.kind).toBe('unreadable');
});

test('a Bun-script agent-progress runs without the project root\'s bunfig.toml preload or .env', async () => {
  const executable = fakeBunExecutableReportingItsLoadedFiles(scratchDirectory);
  const root = createScratchDirectory('board-status-bun-root');
  try {
    writeFileSync(join(root, 'bunfig.toml'), 'preload = ["./example-preload.ts"]\n');
    writeFileSync(join(root, 'example-preload.ts'), '(globalThis as { examplePreloadRan?: boolean }).examplePreloadRan = true;\n');
    writeFileSync(join(root, '.env'), 'EXAMPLE_DOTENV_VALUE=Example Agency\n');
    const verdict = await readBoardStatus({
      executable, root, timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
    });
    expect(verdict).toEqual({ kind: 'unreadable', reason: 'agent-progress status exited with code 3: preload=false dotenv=unset' });
  } finally {
    removeScratchDirectory(root);
  }
});

test('an executable that cannot be started is unreadable', async () => {
  const notExecutable = join(scratchDirectory, 'not-executable');
  writeFileSync(notExecutable, 'plain text');
  const verdict = await readBoardStatus({
    executable: notExecutable, root: scratchDirectory, timeoutMilliseconds: GENEROUS_TIMEOUT_MILLISECONDS, runtimeExecutable: process.execPath
  });
  expect(verdict.kind).toBe('unreadable');
});
