/**
 * The real binary, start to stop, under a scratch home on a free port: `open` must start a detached server and return, a
 * second `open` must reuse it rather than start another, `status` must report it, and `stop` must end it and leave no record.
 */
import { existsSync }             from 'node:fs';
import { afterAll, expect, test } from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchDirectory.ts';
import { processIsAlive }                                 from './ProcessIsAlive.ts';
import { readServerRecord, serverRecordPathOf }           from './ServerRecordFile.ts';
import { freeLocalPort, runAgentDashboard }               from './testing/DashboardProcess.ts';

const END_TO_END_TIMEOUT_MILLISECONDS = 30_000;

const home = createScratchDirectory('end-to-end-home');

afterAll(() => {
  const reading = readServerRecord(home);
  // A failed case must not leave a detached server running on the machine.
  if (reading.kind === 'present' && processIsAlive(reading.record.pid)) process.kill(reading.record.pid, 'SIGTERM');
  removeScratchDirectory(home);
});

test('open starts a server, a second open reuses it, status reports it and stop ends it', async () => {
  const port = freeLocalPort();
  const url = `http://127.0.0.1:${port}`;

  const firstOpen = await runAgentDashboard(['open', '--port', String(port)], home);
  expect(firstOpen.standardError).toBe('');
  expect(firstOpen.exitCode).toBe(0);
  expect(firstOpen.standardOutput).toContain(`Started the dashboard server at ${url}`);
  const startedRecord = readServerRecord(home);
  if (startedRecord.kind !== 'present') throw new Error(`no server record after open: ${startedRecord.kind}`);
  expect(startedRecord.record.port).toBe(port);

  const secondOpen = await runAgentDashboard(['open', '--port', String(port)], home);
  expect(secondOpen.exitCode).toBe(0);
  expect(secondOpen.standardOutput).toContain(`The dashboard server runs at ${url}`);
  expect(readServerRecord(home)).toEqual(startedRecord);

  const status = await runAgentDashboard(['status'], home);
  expect(status.exitCode).toBe(0);
  expect(status.standardOutput).toContain(`runs at ${url} (pid ${startedRecord.record.pid}`);

  const stop = await runAgentDashboard(['stop'], home);
  expect(stop.exitCode).toBe(0);
  expect(stop.standardOutput).toContain(`Stopped the dashboard server at ${url} (pid ${startedRecord.record.pid}).`);
  expect(existsSync(serverRecordPathOf(home))).toBe(false);
  expect(processIsAlive(startedRecord.record.pid)).toBe(false);
}, END_TO_END_TIMEOUT_MILLISECONDS);
