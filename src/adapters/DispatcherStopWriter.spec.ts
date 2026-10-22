/**
 * The writer's verdict is the server's status code, so each exit is planted with a fake executable: 0 is written (and
 * the call is proven to be `dispatcher stopped` in the root), 1 is the CLI's refusal carrying its first line, any
 * other exit, a missing executable and a timeout are failures, none of them a throw.
 */
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join }                                  from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { fakeExecutableFailing, fakeExecutableKeepingADispatcherState, fakeExecutableSleeping } from '../testing/FakeAgentProgressExecutable.ts';
import { createScratchDirectory, removeScratchDirectory }                                       from '../testing/ScratchDirectory.ts';
import { type DispatcherStopRequest, writeDispatcherStopped }                                   from './DispatcherStopWriter.ts';

const GENEROUS_TIMEOUT_MILLISECONDS = 5_000;
const SHORT_TIMEOUT_MILLISECONDS = 200;
const SLEEP_SECONDS = 30;

let scratchDirectory = '';
let projectRoot = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('dispatcher-stop-writer');
  projectRoot = join(scratchDirectory, 'example-project');
  mkdirSync(projectRoot);
});

afterEach(() => removeScratchDirectory(scratchDirectory));

function stopRequest(executable: string | null, timeoutMilliseconds = GENEROUS_TIMEOUT_MILLISECONDS): DispatcherStopRequest {
  return {
    executable, runtimeExecutable: process.execPath, root: projectRoot, timeoutMilliseconds
  };
}

test('exit 0 is written, after running dispatcher stopped in the project root', async () => {
  const statePath = join(scratchDirectory, 'state');
  const callLogPath = join(scratchDirectory, 'calls');
  const executable = fakeExecutableKeepingADispatcherState(scratchDirectory, join(scratchDirectory, 'unused.json'), statePath, callLogPath);
  expect(await writeDispatcherStopped(stopRequest(executable))).toEqual({ kind: 'written' });
  expect(readFileSync(callLogPath, 'utf8')).toBe(`dispatcher stopped in ${realpathSync(projectRoot)}\n`);
  expect(readFileSync(statePath, 'utf8')).toBe('stopped');
});

test('exit 1 is the CLI\'s refusal, carrying the first line it printed, or a fallback when it printed none', async () => {
  const executable = fakeExecutableFailing(scratchDirectory, '\nExample refusal to stop.\n  Usage: example\n', 1);
  expect(await writeDispatcherStopped(stopRequest(executable))).toEqual({ kind: 'refused', reason: 'Example refusal to stop.' });
  expect(await writeDispatcherStopped(stopRequest(fakeExecutableFailing(scratchDirectory, '', 1))))
    .toEqual({ kind: 'refused', reason: 'agent-progress dispatcher refused to stop' });
});

test('any other exit, a missing executable and a timeout are failures', async () => {
  expect(await writeDispatcherStopped(stopRequest(fakeExecutableFailing(scratchDirectory, 'Example crash', 2))))
    .toEqual({ kind: 'failed', reason: 'agent-progress dispatcher exited with code 2: Example crash' });
  expect(await writeDispatcherStopped(stopRequest(null))).toEqual({ kind: 'failed', reason: 'agent-progress is not on PATH' });
  expect(await writeDispatcherStopped(stopRequest(fakeExecutableSleeping(scratchDirectory, SLEEP_SECONDS), SHORT_TIMEOUT_MILLISECONDS)))
    .toEqual({ kind: 'failed', reason: 'agent-progress dispatcher did not finish within 0.2 s and was stopped' });
});
