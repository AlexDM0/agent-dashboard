/**
 * The real binary under a scratch home on a free port. `restart` and its alias `reboot` must each leave the same port answered
 * by a fresh process with its own record and print its pid, through the guarded route a request without the header cannot
 * use. With nothing running it must start a server and open no browser, and when the successor cannot start it must print the
 * reason the servers wrote to the log and exit 2 rather than wait or claim success.
 */
import { dirname }                from 'node:path';
import { afterAll, expect, test } from 'bun:test';

import { processIsAlive }                                 from '../../src/lib/process-liveness/ProcessIsAlive.ts';
import { DASHBOARD_PROTOCOL }                             from '../../src/shared/constants/DashboardProtocol.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchDirectory.ts';
import { type ServerRecord, readServerRecord }            from '../ServerRecordFile.ts';
import {
  onFreeDashboardPort,
  refusedForAHeldPort,
  runAgentDashboard,
  scratchDashboardEnvironment
} from '../testing/DashboardProcess.ts';

const RESTART_SPEC_TIMEOUT_MILLISECONDS = 40_000;
const PORT_GRAB_TIMEOUT_MILLISECONDS = 10_000;
const PORT_GRAB_POLL_MILLISECONDS = 5;

const scratchHomes: string[] = [];

afterAll(() => {
  for (const home of scratchHomes.splice(0)) {
    const reading = readServerRecord(home);
    // A failed case must not leave a detached server running on the machine.
    if (reading.kind === 'present' && processIsAlive(reading.record.pid)) process.kill(reading.record.pid, 'SIGTERM');
    removeScratchDirectory(home);
  }
});

function scratchHome(): string {
  const home = createScratchDirectory('restart-home');
  scratchHomes.push(home);
  return home;
}

async function openedPortIn(home: string): Promise<number> {
  let port = 0;
  const open = await onFreeDashboardPort(async (candidatePort) => {
    port = candidatePort;
    return await runAgentDashboard(['open', '--port', String(candidatePort)], home);
  }, refusedForAHeldPort);
  expect(open.exitCode).toBe(0);
  return port;
}

function presentRecordIn(home: string): ServerRecord {
  const reading = readServerRecord(home);
  if (reading.kind !== 'present') throw new Error(`no server record: ${reading.kind}`);
  return reading.record;
}

test('restart and reboot each hand the port to a new pid and start time in the record and print the new pid', async () => {
  const home = scratchHome();
  const port = await openedPortIn(home);
  const url = `http://127.0.0.1:${port}`;

  for (const commandWord of ['restart', 'reboot']) {
    const before = presentRecordIn(home);
    const restart = await runAgentDashboard([commandWord, '--port', String(port)], home);
    expect(restart.standardError).toBe('');
    expect(restart.exitCode).toBe(0);
    const after = presentRecordIn(home);
    expect(after.pid).not.toBe(before.pid);
    expect(after.startedAt).not.toBe(before.startedAt);
    expect(after.port).toBe(port);
    expect(restart.standardOutput).toContain(`Restarted the dashboard server at ${url}; its pid is now ${after.pid} (was ${before.pid}).`);
    const identity = await (await fetch(`${url}${DASHBOARD_PROTOCOL.IDENTITY_PATH}`)).json() as { pid: number };
    expect(identity.pid).toBe(after.pid);
  }

  expect((await runAgentDashboard(['stop'], home)).exitCode).toBe(0);
}, RESTART_SPEC_TIMEOUT_MILLISECONDS);

test('a restart request without the guard header is refused and leaves the server running', async () => {
  const home = scratchHome();
  const port = await openedPortIn(home);
  const url = `http://127.0.0.1:${port}`;
  const before = presentRecordIn(home);

  const unguarded = await fetch(`${url}${DASHBOARD_PROTOCOL.RESTART_PATH}`, { method: 'POST' });
  expect(unguarded.status).toBe(403);
  const identity = await (await fetch(`${url}${DASHBOARD_PROTOCOL.IDENTITY_PATH}`)).json() as { pid: number };
  expect(identity.pid).toBe(before.pid);
  expect(presentRecordIn(home)).toEqual(before);

  expect((await runAgentDashboard(['stop'], home)).exitCode).toBe(0);
}, RESTART_SPEC_TIMEOUT_MILLISECONDS);

test('restart with no server running starts one, says none was running, opens no browser and exits 0', async () => {
  const home = scratchHome();
  // Browser opening left enabled, with no opener on PATH: an attempt to open one would print that it could not be run.
  const pathWithoutOpeners = dirname(process.execPath);
  for (const opener of ['open', 'xdg-open']) expect(Bun.which(opener, { PATH: pathWithoutOpeners })).toBeNull();
  const environment: Record<string, string> = { ...scratchDashboardEnvironment(home), PATH: pathWithoutOpeners };
  delete environment['AGENT_DASHBOARD_NO_BROWSER'];

  let port = 0;
  const restart = await onFreeDashboardPort(async (candidatePort) => {
    port = candidatePort;
    return await runAgentDashboard(['restart', '--port', String(candidatePort)], home, environment);
  }, refusedForAHeldPort);
  const url = `http://127.0.0.1:${port}`;

  expect(restart.standardError).toBe('');
  expect(restart.exitCode).toBe(0);
  const record = presentRecordIn(home);
  expect(record.port).toBe(port);
  expect(restart.standardOutput).toContain(`No dashboard server was running; started one at ${url} (pid ${record.pid}).`);

  expect((await runAgentDashboard(['stop'], home)).exitCode).toBe(0);
}, RESTART_SPEC_TIMEOUT_MILLISECONDS);

async function boardPortHeldOnceReleased(boardPort: number): Promise<{ stop: () => void } | null> {
  const deadline = performance.now() + PORT_GRAB_TIMEOUT_MILLISECONDS;
  while (performance.now() < deadline) {
    try {
      const listener = Bun.listen({ hostname: '127.0.0.1', port: boardPort, socket: { data: () => {} } });
      return { stop: () => { listener.stop(true); } };
    } catch {
      await Bun.sleep(PORT_GRAB_POLL_MILLISECONDS);
    }
  }
  return null;
}

test('a restart whose successor cannot start prints the reason from the log and exits 2', async () => {
  const home = scratchHome();
  const port = await openedPortIn(home);
  const before = presentRecordIn(home);

  // The board port is taken the moment the old server lets go of it, so the successor finds it held and stops.
  const restarting = runAgentDashboard(['restart', '--port', String(port)], home);
  const boardPortHolder = await boardPortHeldOnceReleased(port + 1);
  try {
    const restart = await restarting;
    expect(boardPortHolder).not.toBeNull();
    expect(restart.exitCode).toBe(2);
    expect(restart.standardError).toContain(`(pid ${before.pid}) was asked to restart, but no successor answered.`);
    expect(restart.standardError).toContain(`Port ${port + 1} on 127.0.0.1, where the board pages are served one above --port, is already held`);
    expect(restart.standardError).toContain('The dashboard server stopped while starting (exit 1)');
    expect(processIsAlive(before.pid)).toBe(false);
  } finally {
    boardPortHolder?.stop();
  }
}, RESTART_SPEC_TIMEOUT_MILLISECONDS);
