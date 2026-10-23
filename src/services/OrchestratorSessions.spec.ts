/**
 * The answer route over the real orchestrator sessions, connected to an in-process fake supervisor in a scratch home.
 * What matters: an answer claims its pending question in the same turn it checks it, so of two answers arriving while
 * the first delivery is still held in the socket, exactly one is delivered (204) and the other is refused (409); and a
 * delivery that fails puts the question back, so it stays pending and answerable.
 * Over a real supervisor and the fake `claude`, the served snapshot carries the session's last action (null before any
 * reply, then the reply's tool call line), and a question's context: the board's run id at asking (null for none), the
 * ticket ids of the question text first, then of the assistant messages before it oldest first, and the last line said.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type Server, type Socket, createServer } from 'node:net';
import { dirname, join }                          from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { readBoardStatus }         from '../adapters/BoardStatusReader.ts';
import type { OrchestratorRecord } from '../adapters/OrchestratorRecordReader.ts';
import { readOrchestratorRecords } from '../adapters/OrchestratorRecordReader.ts';
import type { CapturedQuestion }   from '../adapters/SupervisorLineReader.ts';
import { processIsAlive }          from '../lib/process-liveness/ProcessIsAlive.ts';
import type {
  DashboardSnapshot,
  LaunchToken,
  OrchestratorSession,
  PendingQuestion
} from '../shared/DashboardContract.ts';
import { orchestratorDirectoryOf, orchestratorFilePathsOf }                     from '../shared/OrchestratorFilePaths.ts';
import { DASHBOARD_LIMITS }                                                     from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../testing/ExampleBoards.ts';
import { fakeExecutablePrinting }                                               from '../testing/FakeAgentProgressExecutable.ts';
import {
  FAKE_ASK_MARKER,
  FAKE_QUESTION_REQUEST_ID,
  FAKE_REPLY_PREFIX,
  writeFakeClaudeExecutable
} from '../testing/FakeClaudeExecutable.ts';
import { createShortScratchDirectory, removeScratchDirectory }                              from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                                        from '../testing/WaitUntil.ts';
import { type RunningDashboardServer, createDashboardOrchestratorSessions, serveDashboard } from './DashboardServer.ts';
import { type OrchestratorSessions, createOrchestratorSessions }                            from './OrchestratorSessions.ts';
import { createProjectMonitor }                                                             from './ProjectMonitor.ts';

const TRACKER_ID = 'example-answers-tracker';
const RECONNECT_MILLISECONDS = 60_000;
const QUIET_MILLISECONDS = 50;
const EXAMPLE_INSTANT = new Date('2026-01-01T00:00:00.000Z');
// Far past what a Unix socket buffers, so its write stays unflushed and every write queued behind it waits too.
const SOCKET_FILLING_CHAT_CHARACTERS = 4_000_000;

const CAPTURED_QUESTION: CapturedQuestion = {
  requestId: 'example-request',
  askedAt:   EXAMPLE_INSTANT.toISOString(),
  questions: [{
    question: 'Which example colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: 'Example red' }]
  }],
};
const PENDING_QUESTION: PendingQuestion = { ...CAPTURED_QUESTION, context: { dispatcherRunId: null, mentionedTicketIds: [], lastAssistantLine: null } };
const ANSWER_BODY = JSON.stringify({ requestId: PENDING_QUESTION.requestId, answers: { 'Which example colour?': 'Red' } });

interface FakeSupervisor {
  receivedLines: string[];
  connection:    () => Socket | null;
  stop:          () => void;
}

interface Fixture {
  home:       string;
  server:     RunningDashboardServer;
  sessions:   OrchestratorSessions;
  supervisor: FakeSupervisor;
  answer:     () => Promise<Response>;
}

const fixtures: Fixture[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.supervisor.stop();
    await fixture.server.stop();
    removeScratchDirectory(fixture.home);
  }
});

function startFakeSupervisor(socketPath: string, record: OrchestratorRecord): Promise<FakeSupervisor> {
  const receivedLines: string[] = [];
  let connection: Socket | null = null;
  const listener: Server = createServer((socket) => {
    connection = socket;
    let unfinishedLine = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      const lines = `${unfinishedLine}${chunk}`.split('\n');
      unfinishedLine = lines.pop() ?? '';
      receivedLines.push(...lines);
    });
    socket.on('error', () => {});
    socket.write(`${JSON.stringify({
      kind: 'state', record, state: 'waiting-for-answer', context: null, pendingQuestions: [CAPTURED_QUESTION]
    })}\n`);
  });
  let stopped = false;
  return new Promise((resolve) => {
    listener.listen(socketPath, () => resolve({
      receivedLines,
      connection: () => connection,
      stop() {
        if (stopped) return;
        stopped = true;
        listener.close();
        connection?.destroy();
      },
    }));
  });
}

async function startFixture(): Promise<Fixture> {
  const home = createShortScratchDirectory('as');
  const projectRoot = createExampleProjectRoot(home, 'example-storefront');
  writeExampleRegistry(home, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const orchestratorDirectory = orchestratorDirectoryOf(home);
  mkdirSync(orchestratorDirectory, { recursive: true });
  const paths = orchestratorFilePathsOf(orchestratorDirectory, TRACKER_ID);
  const record: OrchestratorRecord = {
    trackerId:         TRACKER_ID,
    root:              projectRoot,
    supervisorPid:     process.pid,
    sessionPid:        process.pid,
    sessionId:         'example-session',
    socketPath:        paths.socketPath,
    claudeCodeVersion: null,
    startedAt:         EXAMPLE_INSTANT.toISOString(),
  };
  const supervisor = await startFakeSupervisor(paths.socketPath, record);
  writeFileSync(paths.recordPath, JSON.stringify(record));
  const sessions = createOrchestratorSessions({
    orchestratorDirectory,
    runtimeExecutablePath:    process.execPath,
    dashboardEntryPointPath:  join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    startTimeoutMilliseconds: QUIET_MILLISECONDS,
    reconnectMilliseconds:    RECONNECT_MILLISECONDS,
    supervisorEnvironment:    {},
  });
  const options = {
    port:                      0,
    homeDirectory:             home,
    agentProgressExecutable:   null,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    claudeExecutable:          null,
    version:                   '0.0.0-example',
    clock:                     () => EXAMPLE_INSTANT,
    machineParallelAgentLimit: 1,
  };
  const start = await serveDashboard(options, {
    monitor: createProjectMonitor({
      homeDirectory:                home,
      readBoardStatus:              () => Promise.resolve({ kind: 'unreadable', reason: 'Example' }),
      clock:                        () => EXAMPLE_INSTANT,
      quietMilliseconds:            QUIET_MILLISECONDS,
      maximumWaitMilliseconds:      60_000,
      sweepIntervalMilliseconds:    60_000,
      maximumConcurrentStatusReads: 1,
      machineParallelAgentLimit:    1,
    }),
    orchestratorSessions:            sessions,
    heartbeatIntervalMilliseconds:   60_000,
    handoffReplyTimeoutMilliseconds: QUIET_MILLISECONDS,
  });
  if (start.kind !== 'started') throw new Error('the server did not start');
  const { server } = start;
  const launchToken = (await (await fetch(`${server.url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
  const answerUrl = `${server.url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${DASHBOARD_PROTOCOL.ORCHESTRATOR_ANSWERS_PATH_SUFFIX}`;
  const fixture: Fixture = {
    home,
    server,
    sessions,
    supervisor,
    answer: () => fetch(answerUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': server.url, [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: launchToken },
      body:    ANSWER_BODY,
    }),
  };
  fixtures.push(fixture);
  await waitUntil(() => sessions.sessionOf(TRACKER_ID)?.state === 'waiting-for-answer', 'the session showed the pending question');
  return fixture;
}

function answerLinesOf(receivedLines: string[]): string[] {
  return receivedLines.filter((line) => line.includes('"kind":"answer"'));
}

test('of two answers arriving while the first delivery is held, exactly one is delivered with 204 and the other is 409', async () => {
  const { sessions, supervisor, answer } = await startFixture();
  supervisor.connection()?.pause();
  const heldChat = sessions.chat(TRACKER_ID, 'x'.repeat(SOCKET_FILLING_CHAT_CHARACTERS));

  const statuses: number[] = [];
  const answers = [answer(), answer()].map((response) => response.then(({ status }) => statuses.push(status)));
  await waitUntil(() => statuses.length > 0, 'one answer was refused while the other was held');
  expect(statuses).toEqual([409]);

  supervisor.connection()?.resume();
  expect(await heldChat).toEqual({ kind: 'delivered' });
  await Promise.all(answers);
  expect(statuses.toSorted()).toEqual([204, 409]);
  await waitUntil(() => answerLinesOf(supervisor.receivedLines).length > 0, 'the delivered answer reached the supervisor');
  await Bun.sleep(QUIET_MILLISECONDS);
  expect(answerLinesOf(supervisor.receivedLines)).toHaveLength(1);
});

test('an answer whose delivery fails is 502 and leaves the question pending and answerable again', async () => {
  const { sessions, supervisor, answer } = await startFixture();
  supervisor.stop();
  await waitUntil(() => supervisor.connection()?.closed ?? true, 'the supervisor dropped the connection');
  await Bun.sleep(QUIET_MILLISECONDS);

  expect((await answer()).status).toBe(502);
  expect(sessions.sessionOf(TRACKER_ID)?.pendingQuestions).toEqual([PENDING_QUESTION]);
  expect((await answer()).status).toBe(502);
  expect(sessions.sessionOf(TRACKER_ID)?.pendingQuestions).toEqual([PENDING_QUESTION]);
  expect(answerLinesOf(supervisor.receivedLines)).toEqual([]);
});

const LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS = 30_000;
const LIVE_SESSION_WAIT_MILLISECONDS = 10_000;
const LIVE_SESSION_POLL_MILLISECONDS = 50;
const EXAMPLE_DISPATCHER_RUN_ID = 'example-run-41';
const STATUS_DOCUMENT_PATH = join(import.meta.dir, '..', 'adapters', 'testing', 'ScratchTrackerStatusDocument.json');

interface LiveSessionFixture {
  home:        string;
  server:      RunningDashboardServer;
  sessions:    OrchestratorSessions;
  launchToken: string;
}

/** A served dashboard whose supervisors run the fake `claude`, its board printing `dispatcherRunId`. */
async function startLiveSessionFixture(dispatcherRunId: string | null): Promise<LiveSessionFixture> {
  const home = createShortScratchDirectory('ac');
  const projectRoot = createExampleProjectRoot(home, 'example-storefront');
  writeExampleRegistry(home, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const document = JSON.parse(readFileSync(STATUS_DOCUMENT_PATH, 'utf8')) as { concurrency: Record<string, unknown> };
  document.concurrency['dispatcherRunId'] = dispatcherRunId;
  const documentPath = join(home, 'status.json');
  writeFileSync(documentPath, JSON.stringify(document));
  const agentProgressExecutable = fakeExecutablePrinting(home, documentPath);
  const fakeClaude = writeFakeClaudeExecutable(home);
  const options = {
    port:                      0,
    homeDirectory:             home,
    agentProgressExecutable,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    claudeExecutable:          fakeClaude,
    version:                   '0.0.0-example',
    clock:                     () => new Date(),
    machineParallelAgentLimit: 1,
  };
  const supervisorEnvironment = {
    PATH: ['/usr/bin', '/bin', dirname(process.execPath)].join(':'), HOME: home, AGENT_DASHBOARD_NO_BROWSER: '1', AGENT_DASHBOARD_CLAUDE: fakeClaude
  };
  const sessions = createDashboardOrchestratorSessions(options, supervisorEnvironment);
  const start = await serveDashboard(options, {
    monitor: createProjectMonitor({
      homeDirectory:   home,
      readBoardStatus: (root) => readBoardStatus({
        executable: agentProgressExecutable, runtimeExecutable: process.execPath, root, timeoutMilliseconds: DASHBOARD_LIMITS.STATUS_READ_TIMEOUT_MILLISECONDS
      }),
      clock:                        options.clock,
      quietMilliseconds:            QUIET_MILLISECONDS,
      maximumWaitMilliseconds:      60_000,
      sweepIntervalMilliseconds:    60_000,
      maximumConcurrentStatusReads: 1,
      machineParallelAgentLimit:    1,
    }),
    orchestratorSessions:            sessions,
    heartbeatIntervalMilliseconds:   60_000,
    handoffReplyTimeoutMilliseconds: QUIET_MILLISECONDS,
  });
  if (start.kind !== 'started') throw new Error('the server did not start');
  const { server } = start;
  const launchToken = (await (await fetch(`${server.url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
  return {
    home, server, sessions, launchToken
  };
}

/** Stops the session and the server, and kills whatever a failed case left running before the scratch home goes. */
async function stopLiveSessionFixture(fixture: LiveSessionFixture): Promise<void> {
  await fetch(liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX), { method: 'DELETE', headers: liveLaunchHeaders(fixture) });
  await fixture.server.stop();
  for (const reading of readOrchestratorRecords(orchestratorDirectoryOf(fixture.home))) {
    if (reading.kind !== 'present') continue;
    for (const processId of [reading.record.sessionPid, reading.record.supervisorPid]) {
      if (processIsAlive(processId)) process.kill(processId, 'SIGKILL');
    }
  }
  await Bun.sleep(LIVE_SESSION_POLL_MILLISECONDS);
  removeScratchDirectory(fixture.home);
}

function liveProjectPath(fixture: LiveSessionFixture, suffix: string): string {
  return `${fixture.server.url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${suffix}`;
}

function liveLaunchHeaders(fixture: LiveSessionFixture): Record<string, string> {
  return { 'Origin': fixture.server.url, [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: fixture.launchToken, 'Content-Type': 'application/json' };
}

async function servedSnapshotOf(fixture: LiveSessionFixture): Promise<DashboardSnapshot> {
  return await (await fetch(`${fixture.server.url}/api/snapshot`)).json() as DashboardSnapshot;
}

async function servedOrchestratorWhen(fixture: LiveSessionFixture, description: string, condition: (session: OrchestratorSession) => boolean): Promise<OrchestratorSession> {
  const deadline = performance.now() + LIVE_SESSION_WAIT_MILLISECONDS;
  for (;;) {
    const orchestrator = (await servedSnapshotOf(fixture)).projects[0]?.orchestrator ?? null;
    if (orchestrator !== null && condition(orchestrator)) return orchestrator;
    if (performance.now() > deadline) throw new Error(`the served orchestrator never showed ${description}: ${JSON.stringify(orchestrator)}`);
    await Bun.sleep(LIVE_SESSION_POLL_MILLISECONDS);
  }
}

async function sendChat(fixture: LiveSessionFixture, text: string): Promise<void> {
  const messagesPath = liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_MESSAGES_PATH_SUFFIX);
  const sent = await fetch(messagesPath, { method: 'POST', headers: liveLaunchHeaders(fixture), body: JSON.stringify({ text }) });
  expect(sent.status).toBeLessThan(300);
}

async function chatAndAwaitReply(fixture: LiveSessionFixture, text: string): Promise<OrchestratorSession> {
  await sendChat(fixture, text);
  const replied = (): boolean => fixture.sessions.conversationOf(TRACKER_ID).some((message) => message.text === `${FAKE_REPLY_PREFIX}${text}`);
  return await servedOrchestratorWhen(fixture, `the reply to ${text}`, (session) => session.state === 'idle' && replied());
}

interface AskedQuestion {
  beforeAnyReply:  OrchestratorSession;
  afterFirstReply: OrchestratorSession;
  question:        PendingQuestion;
}

/** Starts the session, waits for the board to be read, then asks after two replies naming `#133` and then `#134`. */
async function questionAskedAfterTwoReplies(fixture: LiveSessionFixture): Promise<AskedQuestion> {
  const orchestratorPath = liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX);
  const start = await fetch(orchestratorPath, { method: 'POST', headers: liveLaunchHeaders(fixture), body: '{"startBuilding":false}' });
  expect(start.status).toBe(201);
  const beforeAnyReply = await servedOrchestratorWhen(fixture, 'idle', (session) => session.state === 'idle');
  const deadline = performance.now() + LIVE_SESSION_WAIT_MILLISECONDS;
  while ((await servedSnapshotOf(fixture)).projects[0]?.health.kind !== 'ready') {
    if (performance.now() > deadline) throw new Error('the board was never read');
    await Bun.sleep(LIVE_SESSION_POLL_MILLISECONDS);
  }
  const afterFirstReply = await chatAndAwaitReply(fixture, 'Plan #133 first');
  await chatAndAwaitReply(fixture, 'Then plan #134');
  await sendChat(fixture, FAKE_ASK_MARKER);
  const waiting = await servedOrchestratorWhen(fixture, 'the pending question', (session) => session.pendingQuestions.length > 0);
  const [question] = waiting.pendingQuestions;
  if (question === undefined) throw new Error('no question was pending');
  return { beforeAnyReply, afterFirstReply, question };
}

test('the served session has no last action before a reply, then the reply\'s tool call line as the conversation reads it', async () => {
  const fixture = await startLiveSessionFixture(EXAMPLE_DISPATCHER_RUN_ID);
  try {
    const { beforeAnyReply, afterFirstReply } = await questionAskedAfterTwoReplies(fixture);
    expect(beforeAnyReply.lastAction).toBeNull();
    const conversationAfterReplies = fixture.sessions.conversationOf(TRACKER_ID);
    const firstToolLine = conversationAfterReplies.find((message) => message.role === 'tool');
    expect(firstToolLine?.text).toStartWith('Bash ');
    expect(afterFirstReply.lastAction).toEqual({ at: firstToolLine?.at ?? '', text: firstToolLine?.text ?? '' });
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

test('a served question carries the board\'s run, its own ticket ids then the earlier messages\' ones, and the last line said', async () => {
  const fixture = await startLiveSessionFixture(EXAMPLE_DISPATCHER_RUN_ID);
  try {
    const { question } = await questionAskedAfterTwoReplies(fixture);
    expect(question.requestId).toBe(FAKE_QUESTION_REQUEST_ID);
    expect(question.context).toEqual({
      dispatcherRunId:    EXAMPLE_DISPATCHER_RUN_ID,
      mentionedTicketIds: ['135', '133', '134'],
      lastAssistantLine:  `${FAKE_REPLY_PREFIX}Then plan #134`,
    });
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

test('a question asked on a board with no dispatcher run carries a null run id', async () => {
  const fixture = await startLiveSessionFixture(null);
  try {
    const { question } = await questionAskedAfterTwoReplies(fixture);
    expect(question.context.dispatcherRunId).toBeNull();
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);
