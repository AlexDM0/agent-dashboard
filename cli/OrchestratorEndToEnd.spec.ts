/**
 * A dashboard-owned orchestrator through the real binary, under a scratch home with a fake `claude`: what matters is that
 * a start lacking the launch token or this server's own `Origin` spawns nothing, that the token never leaves through the
 * app shell, the log or the server record, that a started session runs in the project root in auto mode and is still
 * listed and reachable after the server process is killed and started again, and that a session ending, by Stop or by
 * itself, shows `ended` in the next snapshot, and that two simultaneous starts spawn one supervisor.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join }                                  from 'node:path';
import {
  afterAll,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { readOrchestratorRecords }                                              from '../src/adapters/OrchestratorRecordReader.ts';
import { processIsAlive }                                                       from '../src/lib/process-liveness/ProcessIsAlive.ts';
import type { DashboardSnapshot, LaunchToken, OrchestratorSession }             from '../src/shared/DashboardContract.ts';
import { orchestratorDirectoryOf }                                              from '../src/shared/OrchestratorFilePaths.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../src/shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../src/testing/ExampleBoards.ts';
import {
  FAKE_CLAUDE_MODEL,
  FAKE_CONTEXT_WINDOW_TOKENS,
  FAKE_USED_TOKENS,
  type FakeClaudeTranscriptEntry,
  readFakeClaudeTranscript,
  writeFakeClaudeExecutable
} from '../src/testing/FakeClaudeExecutable.ts';
import { createShortScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchDirectory.ts';
import { waitUntil }                                           from '../src/testing/WaitUntil.ts';
import { serverRecordPathOf }                                  from './ServerRecordFile.ts';
import { freeLocalPort, scratchDashboardEnvironment }          from './testing/DashboardProcess.ts';

const END_TO_END_TIMEOUT_MILLISECONDS = 30_000;
const SERVER_START_WAIT_MILLISECONDS = 10_000;
const SESSION_WAIT_MILLISECONDS = 10_000;
const TRACKER_ID = 'example-storefront-tracker';
const PROJECT_NAME = 'Example Storefront';

const home = createShortScratchDirectory('ad');
const projectRoot = createExampleProjectRoot(home, 'example-storefront');
const port = freeLocalPort();
const url = `http://127.0.0.1:${port}`;
const orchestratorPath = `${url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX}`;
const serverOutputs: Promise<string>[] = [];
let server: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | null = null;
let launchToken = '';

function startServer(): Bun.Subprocess<'ignore', 'pipe', 'pipe'> {
  const started = Bun.spawn([process.execPath, join(import.meta.dir, '..', 'agent-dashboard.ts'), 'serve', '--port', String(port)], {
    cwd:    home,
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env:    { ...scratchDashboardEnvironment(home), AGENT_DASHBOARD_CLAUDE: writeFakeClaudeExecutable(home) },
  });
  serverOutputs.push(Promise.all([new Response(started.stdout).text(), new Response(started.stderr).text()]).then((texts) => texts.join('\n')));
  return started;
}

async function serverAnswers(): Promise<boolean> {
  try {
    return (await fetch(`${url}${DASHBOARD_PROTOCOL.IDENTITY_PATH}`)).ok;
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<void> {
  const deadline = performance.now() + SERVER_START_WAIT_MILLISECONDS;
  while (!(await serverAnswers())) {
    if (performance.now() > deadline) throw new Error('the dashboard server did not answer');
    await Bun.sleep(50);
  }
}

function launchHeaders(overrides: Record<string, string | null> = {}): Record<string, string> {
  const headers: Record<string, string | null> = {
    'Origin': url, [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: launchToken, 'Content-Type': 'application/json', ...overrides
  };
  return Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== null));
}

async function orchestratorOfProject(): Promise<OrchestratorSession | null> {
  const snapshot = await (await fetch(`${url}/api/snapshot`)).json() as DashboardSnapshot;
  return snapshot.projects.find((project) => project.trackerId === TRACKER_ID)?.orchestrator ?? null;
}

async function waitForOrchestratorState(
  state: OrchestratorSession['state'],
  alsoHolds: (orchestrator: OrchestratorSession) => boolean = () => true,
): Promise<OrchestratorSession> {
  const deadline = performance.now() + SESSION_WAIT_MILLISECONDS;
  for (;;) {
    const orchestrator = await orchestratorOfProject();
    if (orchestrator?.state === state && alsoHolds(orchestrator)) return orchestrator;
    if (performance.now() > deadline) throw new Error(`the orchestrator never showed ${state}: ${JSON.stringify(orchestrator)}`);
    await Bun.sleep(50);
  }
}

async function fetchLaunchToken(): Promise<string> {
  return (await (await fetch(`${url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
}

beforeAll(async () => {
  writeExampleRegistry(home, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, PROJECT_NAME) });
  server = startServer();
  await waitForServer();
  launchToken = await fetchLaunchToken();
});

afterAll(async () => {
  // A failed case must not leave a server, a supervisor or a fake session running on the machine.
  server?.kill('SIGKILL');
  for (const reading of readOrchestratorRecords(orchestratorDirectoryOf(home))) {
    if (reading.kind !== 'present') continue;
    for (const processId of [reading.record.sessionPid, reading.record.supervisorPid]) {
      if (processIsAlive(processId)) process.kill(processId, 'SIGKILL');
    }
  }
  await Bun.sleep(100);
  removeScratchDirectory(home);
});

test('a start without the launch token, or with a missing or foreign Origin, is refused 403 and spawns nothing', async () => {
  const refusedHeaders = [
    launchHeaders({ [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: null }),
    launchHeaders({ [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: 'not-the-token' }),
    launchHeaders({ Origin: null }),
    launchHeaders({ Origin: 'http://example.invalid' }),
  ];
  for (const headers of refusedHeaders) {
    expect((await fetch(orchestratorPath, { method: 'POST', headers, body: '{"startBuilding":false}' })).status).toBe(403);
    expect((await fetch(orchestratorPath, { method: 'DELETE', headers })).status).toBe(403);
  }
  expect((await fetch(`${url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`, { headers: { Origin: 'http://example.invalid' } })).status).toBe(403);
  expect(existsSync(orchestratorDirectoryOf(home))).toBe(false);
  expect(readFakeClaudeTranscript(home)).toEqual([]);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('an unknown tracker is 404, a body other than { startBuilding } is 400, and a stop with no session is 404', async () => {
  const unknownPath = orchestratorPath.replace(TRACKER_ID, 'no-such-tracker');
  expect((await fetch(unknownPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":false}' })).status).toBe(404);
  expect((await fetch(orchestratorPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":"yes"}' })).status).toBe(400);
  expect((await fetch(orchestratorPath, { method: 'DELETE', headers: launchHeaders() })).status).toBe(404);
  expect(readFakeClaudeTranscript(home)).toEqual([]);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a started session runs in the project root in auto mode and is still reachable after the server is killed and started again', async () => {
  const start = await fetch(orchestratorPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":false}' });
  expect(start.status).toBe(201);
  const started = await start.json() as OrchestratorSession;
  expect(started.ownership).toBe('dashboard');
  await waitUntil(() => readFakeClaudeTranscript(home).length > 0, 'the fake claude started', SESSION_WAIT_MILLISECONDS);
  const [startedEntry] = readFakeClaudeTranscript(home);
  if (startedEntry?.event !== 'started') throw new Error('the fake claude did not start');
  expect(startedEntry.directory).toBe(projectRoot);
  expect(startedEntry.commandLineArguments.join(' ')).toContain('--permission-mode auto');
  expect(startedEntry.commandLineArguments).toContain(started.sessionId);
  expect((await fetch(orchestratorPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":false}' })).status).toBe(409);

  server?.kill('SIGKILL');
  await server?.exited;
  const [reading] = readOrchestratorRecords(orchestratorDirectoryOf(home));
  if (reading?.kind !== 'present') throw new Error('the supervisor record is gone with the server');
  expect(processIsAlive(reading.record.supervisorPid)).toBe(true);

  server = startServer();
  await waitForServer();
  launchToken = await fetchLaunchToken();
  const listed = await waitForOrchestratorState('idle');
  expect(listed.sessionId).toBe(started.sessionId);
  expect(listed.pid).toBe(startedEntry.pid);

  const request = await fetch(`${url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${DASHBOARD_PROTOCOL.ORCHESTRATOR_REQUESTS_PATH_SUFFIX}`, {
    method:  'POST',
    headers: { 'Origin': url, 'Content-Type': 'application/json' },
    body:    '{"kind":"start-building"}',
  });
  expect(request.status).toBe(204);
  const startBuildingArrived = (): boolean => readFakeClaudeTranscript(home).some((entry) => entry.event === 'stdin' && entry.line.includes(PROJECT_NAME));
  await waitUntil(startBuildingArrived, 'the start-building message reached the session', SESSION_WAIT_MILLISECONDS);
  const answered = await waitForOrchestratorState('idle', (orchestrator) => orchestrator.context !== null);
  expect(answered.context).toMatchObject({ usedTokens: FAKE_USED_TOKENS, contextWindowTokens: FAKE_CONTEXT_WINDOW_TOKENS, model: FAKE_CLAUDE_MODEL });

  expect((await fetch(orchestratorPath, { method: 'DELETE', headers: launchHeaders() })).status).toBe(204);
  await waitForOrchestratorState('ended');
  expect(readFakeClaudeTranscript(home).at(-1)).toEqual({ event: 'stdin-closed' });
  expect(readOrchestratorRecords(orchestratorDirectoryOf(home))).toEqual([]);
  expect((await fetch(orchestratorPath, { method: 'DELETE', headers: launchHeaders() })).status).toBe(404);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a session that exits by itself shows ended in the next snapshot, and the project may start another, once', async () => {
  const startOf = (): Promise<Response> => fetch(orchestratorPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":true}' });
  const simultaneousStarts = await Promise.all([startOf(), startOf()]);
  expect(simultaneousStarts.map((start) => start.status).sort()).toEqual([201, 409]);
  const sessionStarts = (): FakeClaudeTranscriptEntry[] => readFakeClaudeTranscript(home).filter((entry) => entry.event === 'started');
  await waitUntil(() => sessionStarts().length === 2, 'the second fake claude started', SESSION_WAIT_MILLISECONDS);
  const latestStart = sessionStarts().at(-1);
  if (latestStart?.event !== 'started') throw new Error('the second fake claude did not start');
  const stdinLineCount = (): number => readFakeClaudeTranscript(home).filter((entry) => entry.event === 'stdin').length;
  await waitUntil(() => stdinLineCount() >= 2, 'the start-building first message arrived', SESSION_WAIT_MILLISECONDS);

  process.kill(latestStart.pid, 'SIGKILL');
  await waitForOrchestratorState('ended');
  expect(readOrchestratorRecords(orchestratorDirectoryOf(home))).toEqual([]);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('the launch token is never in the app shell, the server log or the server record', async () => {
  const appShell = await (await fetch(`${url}/`)).text();
  const serverRecord = readFileSync(serverRecordPathOf(home), 'utf8');
  server?.kill('SIGTERM');
  await server?.exited;
  server = null;
  const serverLog = (await Promise.all(serverOutputs)).join('\n');
  const orchestratorDirectory = orchestratorDirectoryOf(home);
  const orchestratorFiles = readdirSync(orchestratorDirectory)
    .filter((fileName) => !fileName.endsWith('.sock'))
    .map((fileName) => readFileSync(join(orchestratorDirectory, fileName), 'utf8'))
    .join('\n');
  for (const text of [appShell, serverRecord, serverLog, orchestratorFiles]) expect(text).not.toContain(launchToken);
  expect(launchToken.length).toBeGreaterThan(0);
}, END_TO_END_TIMEOUT_MILLISECONDS);
