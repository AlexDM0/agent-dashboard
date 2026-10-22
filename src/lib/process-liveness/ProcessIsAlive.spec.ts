/**
 * The answer a caller trusts to tell a lingering record from a live process: the running process is alive, and one
 * that has exited and been reaped is not.
 */
import { expect, test } from 'bun:test';

import { processIsAlive } from './ProcessIsAlive.ts';

test('the running process is alive', () => {
  expect(processIsAlive(process.pid)).toBe(true);
});

test('a process that has exited is not alive', async () => {
  const exitedProcess = Bun.spawn([process.execPath, '--eval', '0']);
  await exitedProcess.exited;
  expect(processIsAlive(exitedProcess.pid)).toBe(false);
});
