/**
 * The exit code is the CLI's whole contract with scripts: help is 0 on standard output, an unknown command 1 with the help on
 * standard error, a refused argument 1 naming the problem. `status` and `stop` with nothing running must be exit 0, and a
 * stale record (its process gone) must read as nothing running and be removed by `stop`, while a record whose process
 * lives but does not answer is left. A second server must never take over the record of one that answers.
 */
import { existsSync }              from 'node:fs';
import { afterEach, expect, test } from 'bun:test';

import { type RunningDashboardServer, startDashboardServer }       from '../src/services/DashboardServer.ts';
import { createScratchDirectory, removeScratchDirectory }          from '../src/testing/ScratchDirectory.ts';
import { runCommandLine }                                          from './Main.ts';
import { readServerRecord, serverRecordPathOf, writeServerRecord } from './ServerRecordFile.ts';
import { createCapturedCommandContext }                            from './testing/CapturedCommandContext.ts';
import { freeLocalPort }                                           from './testing/DashboardProcess.ts';

const scratchHomes: string[] = [];
const runningServers: RunningDashboardServer[] = [];

afterEach(async () => {
  for (const server of runningServers.splice(0)) await server.stop();
  for (const home of scratchHomes.splice(0)) removeScratchDirectory(home);
});

/** A real dashboard in this process, recorded as the one the home's record names, as a detached `serve` would leave it. */
async function recordedRunningServer(home: string): Promise<RunningDashboardServer> {
  const start = await startDashboardServer({
    port:                      freeLocalPort(),
    homeDirectory:             home,
    agentProgressExecutable:   null,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   'agent-dashboard.ts',
    claudeExecutable:          null,
    version:                   '0.0.0-spec',
    clock:                     () => new Date('2026-09-18T20:11:03Z'),
    machineParallelAgentLimit: 12,
  });
  if (start.kind !== 'started') throw new Error(`the spec server did not start: port ${start.port} in use`);
  runningServers.push(start.server);
  writeServerRecord(home, {
    pid: process.pid, port: start.server.port, url: start.server.url, boardOrigin: start.server.boardOrigin, startedAt: '2026-09-18T20:11:03Z', version: '0.0.0-spec'
  });
  return start.server;
}

function scratchHome(): string {
  const home = createScratchDirectory('main-home');
  scratchHomes.push(home);
  return home;
}

function writeStaleRecord(home: string): void {
  const port = freeLocalPort();
  writeServerRecord(home, {
    pid: 2_147_483_001, port, url: `http://127.0.0.1:${port}`, boardOrigin: null, startedAt: '2026-09-18T20:11:03Z', version: '0.0.0-spec'
  });
}

test('help prints one screen to standard output at exit 0', async () => {
  const context = createCapturedCommandContext(scratchHome());
  expect(await runCommandLine(['help'], context)).toBe(0);
  expect(context.outputText()).toContain('Usage: agent-dashboard');
  expect(context.outputText().split('\n').length).toBeLessThanOrEqual(24);
  expect(context.errorText()).toBe('');
});

test('an unknown command prints the help to standard error at exit 1', async () => {
  const context = createCapturedCommandContext(scratchHome());
  expect(await runCommandLine(['launch'], context)).toBe(1);
  expect(context.errorText()).toContain('Unknown command: "launch".');
  expect(context.errorText()).toContain('Usage: agent-dashboard');
  expect(context.outputText()).toBe('');
});

test('a refused argument names the problem on standard error at exit 1 and starts nothing', async () => {
  const home = scratchHome();
  const context = createCapturedCommandContext(home);
  expect(await runCommandLine(['serve', '--port', '70000'], context)).toBe(1);
  expect(context.errorText()).toContain('--port takes a whole number from 1 to 65534, not "70000".');
  expect(existsSync(serverRecordPathOf(home))).toBe(false);
});

test('a held board port refuses open and serve at exit 1 naming that port, and writes no record', async () => {
  const boardPortHolder = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
  const dashboardPort = boardPortHolder.port - 1;
  try {
    for (const commandLine of [['open', '--no-open', '--port', String(dashboardPort)], ['serve', '--port', String(dashboardPort)]]) {
      const home = scratchHome();
      const context = createCapturedCommandContext(home);
      expect(await runCommandLine(commandLine, context), commandLine.join(' ')).toBe(1);
      expect(context.errorText(), commandLine.join(' ')).toContain(`Port ${boardPortHolder.port} on 127.0.0.1, where the board pages are served`);
      expect(existsSync(serverRecordPathOf(home))).toBe(false);
    }
  } finally {
    boardPortHolder.stop(true);
  }
});

test('status with no record says nothing runs, at exit 0', async () => {
  const context = createCapturedCommandContext(scratchHome());
  expect(await runCommandLine(['status'], context)).toBe(0);
  expect(context.outputText()).toBe('No dashboard server is running.');
});

test('status with a stale record says nothing runs and leaves the record', async () => {
  const home = scratchHome();
  writeStaleRecord(home);
  const context = createCapturedCommandContext(home);
  expect(await runCommandLine(['status'], context)).toBe(0);
  expect(context.outputText()).toBe('No dashboard server is running.');
  expect(existsSync(serverRecordPathOf(home))).toBe(true);
});

test('stop with nothing running is exit 0 with a line saying so', async () => {
  const context = createCapturedCommandContext(scratchHome());
  expect(await runCommandLine(['stop'], context)).toBe(0);
  expect(context.outputText()).toBe('No dashboard server is running.');
});

test('stop leaves the record of a process that lives but does not answer, and refuses at exit 1 naming its pid', async () => {
  const home = scratchHome();
  const port = freeLocalPort();
  writeServerRecord(home, {
    pid: process.pid, port, url: `http://127.0.0.1:${port}`, boardOrigin: null, startedAt: '2026-09-18T20:11:03Z', version: '0.0.0-spec'
  });
  const context = createCapturedCommandContext(home);
  expect(await runCommandLine(['stop'], context)).toBe(1);
  expect(context.errorText()).toContain(`names pid ${process.pid}`);
  expect(existsSync(serverRecordPathOf(home))).toBe(true);
});

test('serve refuses at exit 1 while another dashboard answers for the record, and leaves its record', async () => {
  const home = scratchHome();
  const running = await recordedRunningServer(home);
  const context = createCapturedCommandContext(home);
  expect(await runCommandLine(['serve', '--port', String(freeLocalPort())], context)).toBe(1);
  expect(context.errorText()).toContain(`already runs at ${running.url}; stop it with agent-dashboard stop`);
  expect(readServerRecord(home)).toMatchObject({ kind: 'present', record: { pid: process.pid, url: running.url } });
});

test('open with another --port than the running dashboard\'s refuses at exit 1; its own port, or none, reuses it', async () => {
  const home = scratchHome();
  const running = await recordedRunningServer(home);
  const refused = createCapturedCommandContext(home);
  expect(await runCommandLine(['open', '--port', String(freeLocalPort())], refused)).toBe(1);
  expect(refused.errorText()).toContain(`already runs at ${running.url}`);
  for (const commandLine of [['open', '--port', String(running.port)], ['open']]) {
    const reused = createCapturedCommandContext(home);
    expect(await runCommandLine(commandLine, reused), commandLine.join(' ')).toBe(0);
    expect(reused.outputText()).toBe(`The dashboard server runs at ${running.url}`);
  }
});

test('stop removes a stale record', async () => {
  const home = scratchHome();
  writeStaleRecord(home);
  const context = createCapturedCommandContext(home);
  expect(await runCommandLine(['stop'], context)).toBe(0);
  expect(context.outputText()).toBe('No dashboard server is running; removed its stale server record.');
  expect(existsSync(serverRecordPathOf(home))).toBe(false);
});
