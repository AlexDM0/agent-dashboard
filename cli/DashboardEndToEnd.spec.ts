/**
 * The real binary, start to stop, under a scratch home on a free port: `open` must start a detached server and return, a
 * second `open` must reuse it rather than start another, `status` must report it, and `stop` must end it and leave no record.
 * A restart the page asks for must leave the same port answered by a fresh process, its own record written, the old one gone
 * once it has seen the fresh one answer.
 */
import { existsSync }             from 'node:fs';
import { afterAll, expect, test } from 'bun:test';

import { processIsAlive }                                              from '../src/lib/process-liveness/ProcessIsAlive.ts';
import { DASHBOARD_PROTOCOL }                                          from '../src/shared/constants/DashboardProtocol.ts';
import { createScratchDirectory, removeScratchDirectory }              from '../src/testing/ScratchDirectory.ts';
import { readServerRecord, serverRecordPathOf }                        from './ServerRecordFile.ts';
import { onFreeDashboardPort, refusedForAHeldPort, runAgentDashboard } from './testing/DashboardProcess.ts';

const END_TO_END_TIMEOUT_MILLISECONDS = 30_000;
const RESTART_TIMEOUT_MILLISECONDS = 10_000;
const RESTART_POLL_INTERVAL_MILLISECONDS = 50;

const home = createScratchDirectory('end-to-end-home');

afterAll(() => {
  const reading = readServerRecord(home);
  // A failed case must not leave a detached server running on the machine.
  if (reading.kind === 'present' && processIsAlive(reading.record.pid)) process.kill(reading.record.pid, 'SIGTERM');
  removeScratchDirectory(home);
});

test('open starts a server, a second open reuses it, status reports it and stop ends it', async () => {
  let port = 0;
  const firstOpen = await onFreeDashboardPort(async (candidatePort) => {
    port = candidatePort;
    return await runAgentDashboard(['open', '--port', String(candidatePort)], home);
  }, refusedForAHeldPort);
  const url = `http://127.0.0.1:${port}`;

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
  expect(startedRecord.record.boardOrigin).toBe(`http://127.0.0.1:${port + 1}`);
  expect(status.standardOutput).toContain(`runs at ${url}, its board pages at http://127.0.0.1:${port + 1} (pid ${startedRecord.record.pid}`);

  const stop = await runAgentDashboard(['stop'], home);
  expect(stop.exitCode).toBe(0);
  expect(stop.standardOutput).toContain(`Stopped the dashboard server at ${url} (pid ${startedRecord.record.pid}).`);
  expect(existsSync(serverRecordPathOf(home))).toBe(false);
  expect(processIsAlive(startedRecord.record.pid)).toBe(false);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a restart hands the port to a fresh server with a new pid and start time in the record', async () => {
  let port = 0;
  const open = await onFreeDashboardPort(async (candidatePort) => {
    port = candidatePort;
    return await runAgentDashboard(['open', '--port', String(candidatePort)], home);
  }, refusedForAHeldPort);
  expect(open.exitCode).toBe(0);
  const url = `http://127.0.0.1:${port}`;
  const firstRecord = readServerRecord(home);
  if (firstRecord.kind !== 'present') throw new Error(`no server record after open: ${firstRecord.kind}`);

  const restart = await fetch(`${url}${DASHBOARD_PROTOCOL.RESTART_PATH}`, {
    method:  'POST',
    headers: { [DASHBOARD_PROTOCOL.RESTART_HEADER_NAME]: DASHBOARD_PROTOCOL.RESTART_HEADER_VALUE, Origin: url },
  });
  expect(restart.status).toBe(DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS);

  const deadline = performance.now() + RESTART_TIMEOUT_MILLISECONDS;
  let successorRecord = readServerRecord(home);
  while (performance.now() < deadline && (successorRecord.kind !== 'present' || successorRecord.record.pid === firstRecord.record.pid)) {
    await Bun.sleep(RESTART_POLL_INTERVAL_MILLISECONDS);
    successorRecord = readServerRecord(home);
  }
  if (successorRecord.kind !== 'present') throw new Error(`no server record after the restart: ${successorRecord.kind}`);
  expect(successorRecord.record.pid).not.toBe(firstRecord.record.pid);
  expect(successorRecord.record.startedAt).not.toBe(firstRecord.record.startedAt);
  expect(successorRecord.record.port).toBe(port);
  expect(successorRecord.record.boardOrigin).toBe(firstRecord.record.boardOrigin);
  const identity = await (await fetch(`${url}${DASHBOARD_PROTOCOL.IDENTITY_PATH}`)).json() as { pid: number };
  expect(identity.pid).toBe(successorRecord.record.pid);
  // The old process exits once it has seen its successor answer.
  while (performance.now() < deadline && processIsAlive(firstRecord.record.pid)) await Bun.sleep(RESTART_POLL_INTERVAL_MILLISECONDS);
  expect(processIsAlive(firstRecord.record.pid)).toBe(false);

  expect((await runAgentDashboard(['stop'], home)).exitCode).toBe(0);
}, END_TO_END_TIMEOUT_MILLISECONDS);
