/**
 * The writer's verdict is the server's status code, so each exit is planted with a fake executable: 0 is written (and
 * the call is proven to be `concurrency <limit>` in the root), 1 is the CLI's refusal carrying its first line, any
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

import { fakeExecutableFailing, fakeExecutableKeepingAConcurrencyLimit, fakeExecutableSleeping } from '../testing/FakeAgentProgressExecutable.ts';
import { createScratchDirectory, removeScratchDirectory }                                        from '../testing/ScratchDirectory.ts';
import { type ConcurrencyLimitWriteRequest, writeConcurrencyLimit }                              from './ConcurrencyLimitWriter.ts';

const GENEROUS_TIMEOUT_MILLISECONDS = 5_000;
const SHORT_TIMEOUT_MILLISECONDS = 200;
const SLEEP_SECONDS = 30;

let scratchDirectory = '';
let projectRoot = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('concurrency-limit-writer');
  projectRoot = join(scratchDirectory, 'example-project');
  mkdirSync(projectRoot);
});

afterEach(() => removeScratchDirectory(scratchDirectory));

function writeRequest(executable: string | null, limit: number, timeoutMilliseconds = GENEROUS_TIMEOUT_MILLISECONDS): ConcurrencyLimitWriteRequest {
  return {
    executable, runtimeExecutable: process.execPath, root: projectRoot, limit, timeoutMilliseconds
  };
}

test('exit 0 is written, after running concurrency with the limit in the project root', async () => {
  const limitPath = join(scratchDirectory, 'limit');
  const callLogPath = join(scratchDirectory, 'calls');
  const executable = fakeExecutableKeepingAConcurrencyLimit(scratchDirectory, join(scratchDirectory, 'unused.json'), limitPath, callLogPath);
  expect(await writeConcurrencyLimit(writeRequest(executable, 7))).toEqual({ kind: 'written' });
  expect(readFileSync(callLogPath, 'utf8')).toBe(`concurrency 7 in ${realpathSync(projectRoot)}\n`);
  expect(readFileSync(limitPath, 'utf8')).toBe('7');
});

test('exit 1 is the CLI\'s refusal, carrying the first line it printed', async () => {
  const executable = fakeExecutableFailing(scratchDirectory, '\n"11" is not a concurrency limit.\n  Usage: example\n', 1);
  expect(await writeConcurrencyLimit(writeRequest(executable, 4))).toEqual({ kind: 'refused', reason: '"11" is not a concurrency limit.' });
});

test('any other exit, a missing executable and a timeout are failures', async () => {
  expect(await writeConcurrencyLimit(writeRequest(fakeExecutableFailing(scratchDirectory, 'Example crash', 2), 4)))
    .toEqual({ kind: 'failed', reason: 'agent-progress concurrency exited with code 2: Example crash' });
  expect(await writeConcurrencyLimit(writeRequest(null, 4))).toEqual({ kind: 'failed', reason: 'agent-progress is not on PATH' });
  expect(await writeConcurrencyLimit(writeRequest(fakeExecutableSleeping(scratchDirectory, SLEEP_SECONDS), 4, SHORT_TIMEOUT_MILLISECONDS)))
    .toEqual({ kind: 'failed', reason: 'agent-progress concurrency did not finish within 0.2 s and was stopped' });
});
