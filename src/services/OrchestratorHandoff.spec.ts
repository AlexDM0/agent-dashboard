/**
 * The handoff route on an in-process server over a scratch home, its supervisors started with a scratch environment and
 * a fake `claude`, its board read by a fake agent-progress keeping a dispatcher state. What matters: a handoff asks the
 * running session one fixed message, keeps the reply as the note in the dashboard's own handoffs folder (never the
 * project), stops that session and starts a fresh one whose first message has it load the agent-progress-orchestrate
 * skill and carries the note, listed with the previous session id; and a refused (pending question, a busy session, a
 * running dispatcher) or failed one (the session ends, or gives no reply in time) changes nothing: the old session is
 * left as it was and no session is started.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { readBoardStatus }         from '../adapters/BoardStatusReader.ts';
import { readOrchestratorRecords } from '../adapters/OrchestratorRecordReader.ts';
import { processIsAlive }          from '../lib/process-liveness/ProcessIsAlive.ts';
import type {
  DashboardSnapshot,
  LaunchToken,
  OrchestratorHandoffResult,
  OrchestratorSession
} from '../shared/DashboardContract.ts';
import { orchestratorDirectoryOf }                                              from '../shared/OrchestratorFilePaths.ts';
import { DASHBOARD_LIMITS }                                                     from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../testing/ExampleBoards.ts';
import { fakeExecutableKeepingADispatcherState }                                from '../testing/FakeAgentProgressExecutable.ts';
import {
  FAKE_ASK_MARKER,
  FAKE_QUESTION,
  FAKE_QUESTION_REQUEST_ID,
  FAKE_REPLY_PREFIX,
  readFakeClaudeTranscript,
  setFakeClaudeMode,
  writeFakeClaudeExecutable
} from '../testing/FakeClaudeExecutable.ts';
import { createShortScratchDirectory, removeScratchDirectory }                              from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                                        from '../testing/WaitUntil.ts';
import { type RunningDashboardServer, createDashboardOrchestratorSessions, serveDashboard } from './DashboardServer.ts';
import { HANDOFF_NOTE_REQUEST, freshSessionMessageOf, handoffDirectoryOf }                  from './OrchestratorHandoff.ts';
import { orchestratorStartTextOf }                                                          from './OrchestratorRequestMessage.ts';
import { createProjectMonitor }                                                             from './ProjectMonitor.ts';

const SPEC_TIMEOUT_MILLISECONDS = 30_000;
const SESSION_WAIT_MILLISECONDS = 10_000;
const SHORT_REPLY_TIMEOUT_MILLISECONDS = 1_500;
const HEARTBEAT_MILLISECONDS = 25_000;
const TRACKER_ID = 'example-handoff-tracker';
const START_TEXT = orchestratorStartTextOf('Example Storefront');

const home = createShortScratchDirectory('ah');
const projectRoot = createExampleProjectRoot(home, 'example-storefront');
const dispatcherStatePath = join(home, 'dispatcher-state');
const statusDocumentPath = join(import.meta.dir, '..', 'adapters', 'testing', 'ScratchTrackerStatusDocument.json');
const fakeClaude = writeFakeClaudeExecutable(home);
let server: RunningDashboardServer | null = null;
let launchToken = '';

function runningServer(): RunningDashboardServer {
  if (server === null) throw new Error('the server is not running');
  return server;
}

function projectPath(suffix: string): string {
  return `${runningServer().url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${suffix}`;
}

function launchHeaders(): Record<string, string> {
  return { 'Origin': runningServer().url, [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: launchToken, 'Content-Type': 'application/json' };
}

function handOff(headers = launchHeaders()): Promise<Response> {
  return fetch(projectPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_HANDOFF_PATH_SUFFIX), { method: 'POST', headers });
}

function chat(text: string): Promise<Response> {
  return fetch(projectPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_MESSAGES_PATH_SUFFIX), { method: 'POST', headers: launchHeaders(), body: JSON.stringify({ text }) });
}

async function orchestratorOfProject(): Promise<OrchestratorSession | null> {
  const snapshot = await (await fetch(`${runningServer().url}/api/snapshot`)).json() as DashboardSnapshot;
  return snapshot.projects.find((project) => project.trackerId === TRACKER_ID)?.orchestrator ?? null;
}

async function waitForOrchestratorState(
  state: OrchestratorSession['state'],
  alsoHolds: (orchestrator: OrchestratorSession) => boolean = () => true
): Promise<OrchestratorSession> {
  const deadline = performance.now() + SESSION_WAIT_MILLISECONDS;
  for (;;) {
    const orchestrator = await orchestratorOfProject();
    if (orchestrator?.state === state && alsoHolds(orchestrator)) return orchestrator;
    if (performance.now() > deadline) throw new Error(`the orchestrator never showed ${state}: ${JSON.stringify(orchestrator)}`);
    await Bun.sleep(50);
  }
}

/** Resolves once the fake has started and answered the start turn, so the session is idle for a handoff. */
async function startSession(): Promise<OrchestratorSession> {
  const startsBefore = sessionStartCount();
  const start = await fetch(projectPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX), { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":false}' });
  expect(start.status).toBe(201);
  await waitUntil(() => sessionStartCount() > startsBefore, 'the fake claude started', SESSION_WAIT_MILLISECONDS);
  await waitForOrchestratorState('idle', (orchestrator) => orchestrator.lastAction !== null);
  return await start.json() as OrchestratorSession;
}

async function stopSession(): Promise<void> {
  setFakeClaudeMode(home, 'reply');
  const stop = await fetch(projectPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX), { method: 'DELETE', headers: launchHeaders() });
  if (stop.status === 204) await waitForOrchestratorState('ended');
}

const sessionStartCount = (): number => readFakeClaudeTranscript(home).filter((entry) => entry.event === 'started').length;

function keptNotes(): string[] {
  const handoffDirectory = handoffDirectoryOf(home);
  return existsSync(handoffDirectory) ? readdirSync(handoffDirectory) : [];
}

/** Each stdin line the session started `startIndex`-th received, in order. */
function stdinLinesOfSession(startIndex: number): string[] {
  const transcript = readFakeClaudeTranscript(home);
  const startPositions = transcript.flatMap((entry, position) => (entry.event === 'started' ? [position] : []));
  const from = startPositions[startIndex] ?? transcript.length;
  const until = startPositions[startIndex + 1] ?? transcript.length;
  return transcript.slice(from, until).flatMap((entry) => (entry.event === 'stdin' && entry.line.length > 0 ? [entry.line] : []));
}

beforeAll(async () => {
  writeExampleRegistry(home, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'Example Storefront') });
  writeFileSync(dispatcherStatePath, 'stopped');
  const agentProgressExecutable = fakeExecutableKeepingADispatcherState(home, statusDocumentPath, dispatcherStatePath, join(home, 'agent-progress-calls'));
  const options = {
    port:                      0,
    homeDirectory:             home,
    agentProgressExecutable,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    dashboardDirectory:        join(import.meta.dir, '..', '..'),
    claudeExecutable:          fakeClaude,
    version:                   '0.0.0-example',
    clock:                     () => new Date(),
    machineParallelAgentLimit: 4,
  };
  const monitor = createProjectMonitor({
    homeDirectory:   home,
    readBoardStatus: (root) => readBoardStatus({
      executable: agentProgressExecutable, runtimeExecutable: process.execPath, root, timeoutMilliseconds: DASHBOARD_LIMITS.STATUS_READ_TIMEOUT_MILLISECONDS
    }),
    clock:                        options.clock,
    quietMilliseconds:            DASHBOARD_LIMITS.REFRESH_QUIET_MILLISECONDS,
    maximumWaitMilliseconds:      DASHBOARD_LIMITS.REFRESH_MAXIMUM_WAIT_MILLISECONDS,
    sweepIntervalMilliseconds:    DASHBOARD_LIMITS.SAFETY_SWEEP_INTERVAL_MILLISECONDS,
    maximumConcurrentStatusReads: DASHBOARD_LIMITS.MAXIMUM_CONCURRENT_STATUS_READS,
    machineParallelAgentLimit:    options.machineParallelAgentLimit,
  });
  const supervisorEnvironment = {
    PATH: ['/usr/bin', '/bin', dirname(process.execPath)].join(':'), HOME: home, AGENT_DASHBOARD_NO_BROWSER: '1', AGENT_DASHBOARD_CLAUDE: fakeClaude
  };
  const start = await serveDashboard(options, {
    monitor,
    orchestratorSessions:            createDashboardOrchestratorSessions(options, supervisorEnvironment),
    productOwnerSessions:            createDashboardOrchestratorSessions(options, supervisorEnvironment, 'product-owner'),
    heartbeatIntervalMilliseconds:   HEARTBEAT_MILLISECONDS,
    handoffReplyTimeoutMilliseconds: SHORT_REPLY_TIMEOUT_MILLISECONDS,
  });
  if (start.kind !== 'started') throw new Error('the server did not start');
  ({ server } = start);
  launchToken = (await (await fetch(`${server.url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
});

afterEach(async () => {
  await stopSession();
  writeFileSync(dispatcherStatePath, 'stopped');
});

afterAll(async () => {
  await server?.stop();
  // A failed case must not leave a supervisor or a fake session running on the machine.
  for (const reading of readOrchestratorRecords(orchestratorDirectoryOf(home))) {
    if (reading.kind !== 'present') continue;
    for (const processId of [reading.record.sessionPid, reading.record.supervisorPid]) {
      if (processIsAlive(processId)) process.kill(processId, 'SIGKILL');
    }
  }
  await Bun.sleep(100);
  removeScratchDirectory(home);
});

test('without the launch token the handoff is 403, and with no dashboard-owned session 404, both starting nothing', async () => {
  expect((await handOff({ Origin: runningServer().url })).status).toBe(403);
  expect((await handOff()).status).toBe(404);
  expect(sessionStartCount()).toBe(0);
}, SPEC_TIMEOUT_MILLISECONDS);

test('a handoff keeps the reply as the note outside the project, stops the session and starts a fresh one carrying the note', async () => {
  const previous = await startSession();
  const startsBefore = sessionStartCount();

  const handoff = await handOff();
  expect(handoff.status).toBe(201);
  const { session, notePath } = await handoff.json() as OrchestratorHandoffResult;

  expect(stdinLinesOfSession(startsBefore - 1).map((line) => (JSON.parse(line) as { message: { content: string } }).message.content)).toEqual([START_TEXT, HANDOFF_NOTE_REQUEST]);
  const note = `${FAKE_REPLY_PREFIX}${HANDOFF_NOTE_REQUEST}`;
  expect(dirname(notePath)).toBe(handoffDirectoryOf(home));
  expect(notePath.startsWith(`${handoffDirectoryOf(home)}/${TRACKER_ID}-`)).toBe(true);
  expect(readFileSync(notePath, 'utf8')).toBe(`${note}\n`);
  expect(readFakeClaudeTranscript(home).some((entry) => entry.event === 'stdin-closed')).toBe(true);

  expect(session.sessionId).not.toBe(previous.sessionId);
  expect(session.previousSessionId).toBe(previous.sessionId);
  await waitUntil(() => sessionStartCount() === startsBefore + 1, 'the fresh fake claude started', SESSION_WAIT_MILLISECONDS);
  await waitUntil(() => stdinLinesOfSession(startsBefore).length > 0, 'the fresh session got its first message', SESSION_WAIT_MILLISECONDS);
  const [firstMessage] = stdinLinesOfSession(startsBefore).map((line) => (JSON.parse(line) as { message: { content: string } }).message.content);
  expect(firstMessage).toContain('You continue the previous orchestrator\'s work');
  expect(firstMessage).toContain(previous.sessionId);
  expect(firstMessage).toContain(note);

  const listed = await waitForOrchestratorState('idle');
  expect(listed).toMatchObject({ ownership: 'dashboard', sessionId: session.sessionId, previousSessionId: previous.sessionId });
  const projectFiles = readdirSync(projectRoot, { recursive: true }).map(String);
  expect(projectFiles.filter((fileName) => fileName.endsWith('.md'))).toEqual([]);
}, SPEC_TIMEOUT_MILLISECONDS);

test('the fresh session is told to load the agent-progress-orchestrate skill before the note it acts on', () => {
  const note = 'Example note: ticket #001 is in review.';
  const firstMessage = freshSessionMessageOf('example-previous-session', '/example/handoffs/note.md', note);
  const skillInstructionIndex = firstMessage.indexOf('Load the agent-progress-orchestrate skill');
  expect(skillInstructionIndex).toBeGreaterThan(-1);
  expect(skillInstructionIndex).toBeLessThan(firstMessage.indexOf(note));
});

test('a handoff is 409 and changes nothing while a question is pending, while the session is busy, or while the dispatcher runs', async () => {
  const previous = await startSession();
  const startsBefore = sessionStartCount();
  const linesBefore = stdinLinesOfSession(startsBefore - 1).length;
  const notesBefore = keptNotes();

  writeFileSync(dispatcherStatePath, 'running');
  const whileRunning = await handOff();
  expect(whileRunning.status).toBe(409);
  expect(await whileRunning.text()).toContain('dispatcher is running');
  writeFileSync(dispatcherStatePath, 'stopped');

  expect((await chat(`Please ${FAKE_ASK_MARKER}`)).status).toBe(204);
  await waitForOrchestratorState('waiting-for-answer');
  const whileAsking = await handOff();
  expect(whileAsking.status).toBe(409);
  expect(await whileAsking.text()).toContain('question');
  const answerBody = JSON.stringify({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Red' } });
  const answer = await fetch(projectPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_ANSWERS_PATH_SUFFIX), { method: 'POST', headers: launchHeaders(), body: answerBody });
  expect(answer.status).toBe(204);
  await waitForOrchestratorState('idle');

  setFakeClaudeMode(home, 'silent');
  expect((await chat('A turn that never ends')).status).toBe(204);
  await waitForOrchestratorState('busy');
  const whileBusy = await handOff();
  expect(whileBusy.status).toBe(409);
  expect(await whileBusy.text()).toContain('busy');

  const lines = stdinLinesOfSession(startsBefore - 1);
  expect(lines.slice(linesBefore).some((line) => line.includes(HANDOFF_NOTE_REQUEST))).toBe(false);
  expect(sessionStartCount()).toBe(startsBefore);
  expect(keptNotes()).toEqual(notesBefore);
  expect((await orchestratorOfProject())?.sessionId).toBe(previous.sessionId);
}, SPEC_TIMEOUT_MILLISECONDS);

test('a session that gives no reply in time is left running, the handoff 502 with nothing started or kept', async () => {
  const previous = await startSession();
  const startsBefore = sessionStartCount();
  const notesBefore = keptNotes();
  setFakeClaudeMode(home, 'silent');

  const handoff = await handOff();
  expect(handoff.status).toBe(502);
  expect(await handoff.text()).toContain(`no complete reply within ${SHORT_REPLY_TIMEOUT_MILLISECONDS} ms`);
  const still = await orchestratorOfProject();
  expect(still).toMatchObject({ sessionId: previous.sessionId, state: 'busy' });
  expect(processIsAlive(still?.pid ?? 0)).toBe(true);
  expect(sessionStartCount()).toBe(startsBefore);
  expect(keptNotes()).toEqual(notesBefore);
}, SPEC_TIMEOUT_MILLISECONDS);

test('a session that ends instead of replying makes the handoff 502 with nothing started or kept', async () => {
  await startSession();
  const startsBefore = sessionStartCount();
  const notesBefore = keptNotes();
  setFakeClaudeMode(home, 'exit');

  const handoff = await handOff();
  expect(handoff.status).toBe(502);
  expect(await handoff.text()).toContain('ended before it replied');
  expect(readFakeClaudeTranscript(home).at(-1)).toEqual({ event: 'exited-unreplied' });
  await Bun.sleep(200);
  expect(sessionStartCount()).toBe(startsBefore);
  expect(keptNotes()).toEqual(notesBefore);
  expect((await orchestratorOfProject())?.state).toBe('ended');
}, SPEC_TIMEOUT_MILLISECONDS);
