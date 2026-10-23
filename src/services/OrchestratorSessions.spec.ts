/**
 * The answer route over the real orchestrator sessions, connected to an in-process fake supervisor in a scratch home.
 * What matters: an answer claims its pending question in the same turn it checks it, so of two answers arriving while
 * the first delivery is still held in the socket, exactly one is delivered (204) and the other is refused (409); and a
 * delivery that fails puts the question back, so it stays pending and answerable.
 * Over a real supervisor and the fake `claude`, the served snapshot carries the session's last action (the newest reply's
 * tool call line, the start turn's first), and a question's context: the board's run id at asking (null for none), the
 * ticket ids of the question text first, then of the assistant messages before it oldest first, and the last line said.
 * A product owner starts beside a live orchestrator, one per project, briefed by its first message for its mode; with
 * both live, nothing sent to the product owner reaches the orchestrator. A record under the file name used before roles
 * is recovered as the orchestrator's, so a server upgraded mid-run still finds a live one.
 * Open in Claude app ends the session before `claude --desktop --resume <id>` starts, under a terminal, in the project
 * root, and the app's session record is then watched rather than shadowed by the ended owned one; it refuses without
 * the launch token and without a live owned session, starting nothing.
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs';
import { type Server, type Socket, createServer } from 'node:net';
import { dirname, join }                          from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import { readBoardStatus }         from '../adapters/BoardStatusReader.ts';
import type { OrchestratorRecord } from '../adapters/OrchestratorRecordReader.ts';
import { readOrchestratorRecords } from '../adapters/OrchestratorRecordReader.ts';
import type { CapturedQuestion }   from '../adapters/SupervisorLineReader.ts';
import { processIsAlive }          from '../lib/process-liveness/ProcessIsAlive.ts';
import type {
  ChatMessage,
  DashboardSnapshot,
  LaunchToken,
  OrchestratorSession,
  PendingQuestion
} from '../shared/DashboardContract.ts';
import { orchestratorDirectoryOf, orchestratorFilePathsOf }                     from '../shared/OrchestratorFilePaths.ts';
import { DASHBOARD_FILES }                                                      from '../shared/constants/DashboardFiles.ts';
import { DASHBOARD_LIMITS }                                                     from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../testing/ExampleBoards.ts';
import { createExampleWorkflowRun, writeExampleSessionRecord }                  from '../testing/ExampleClaudeSessions.ts';
import { fakeExecutablePrinting }                                               from '../testing/FakeAgentProgressExecutable.ts';
import {
  FAKE_ANSWERED_PREFIX,
  FAKE_ASK_MARKER,
  FAKE_QUESTION,
  FAKE_QUESTION_REQUEST_ID,
  FAKE_REPLY_PREFIX,
  readFakeClaudeTranscript,
  writeFakeClaudeExecutable
} from '../testing/FakeClaudeExecutable.ts';
import { createShortScratchDirectory, removeScratchDirectory }                              from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                                        from '../testing/WaitUntil.ts';
import { type RunningDashboardServer, createDashboardOrchestratorSessions, serveDashboard } from './DashboardServer.ts';
import { orchestratorStartTextOf }                                                          from './OrchestratorRequestMessage.ts';
import { type OrchestratorSessions, createOrchestratorSessions }                            from './OrchestratorSessions.ts';
import { PRODUCT_OWNER_WRAP_UP_TEXT, productOwnerBriefTextOf }                              from './ProductOwnerBriefMessage.ts';
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
  home:                 string;
  server:               RunningDashboardServer;
  sessions:             OrchestratorSessions;
  productOwnerSessions: OrchestratorSessions;
  supervisor:           FakeSupervisor;
  answer:               () => Promise<Response>;
}

const fixtures: Fixture[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    fixture.supervisor.stop();
    await fixture.server.stop();
    removeScratchDirectory(fixture.home);
  }
});

/** Where a supervisor started before roles existed kept its files: named by a hash of the tracker id alone. */
function filePathsBeforeRolesOf(orchestratorDirectory: string, trackerId: string): { recordPath: string; socketPath: string } {
  const key = createHash('sha256').update(trackerId).digest('hex').slice(0, DASHBOARD_FILES.ORCHESTRATOR_KEY_HEX_DIGITS);
  return {
    recordPath: join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_RECORD_SUFFIX}`),
    socketPath: join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_SOCKET_SUFFIX}`),
  };
}

function startFakeSupervisor(socketPath: string, record: Record<string, unknown>): Promise<FakeSupervisor> {
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

async function startFixture(recordNaming: 'role-qualified' | 'before-roles' = 'role-qualified'): Promise<Fixture> {
  const home = createShortScratchDirectory('as');
  const projectRoot = createExampleProjectRoot(home, 'example-storefront');
  writeExampleRegistry(home, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const orchestratorDirectory = orchestratorDirectoryOf(home);
  mkdirSync(orchestratorDirectory, { recursive: true });
  const paths = recordNaming === 'role-qualified'
    ? orchestratorFilePathsOf(orchestratorDirectory, TRACKER_ID, 'orchestrator')
    : filePathsBeforeRolesOf(orchestratorDirectory, TRACKER_ID);
  const record: OrchestratorRecord = {
    trackerId:         TRACKER_ID,
    role:              'orchestrator',
    root:              projectRoot,
    supervisorPid:     process.pid,
    sessionPid:        process.pid,
    sessionId:         'example-session',
    socketPath:        paths.socketPath,
    claudeCodeVersion: null,
    startedAt:         EXAMPLE_INSTANT.toISOString(),
  };
  const recordWithoutRole = Object.fromEntries(Object.entries(record).filter(([field]) => field !== 'role'));
  const writtenRecord: Record<string, unknown> = recordNaming === 'role-qualified' ? { ...record } : recordWithoutRole;
  const supervisor = await startFakeSupervisor(paths.socketPath, writtenRecord);
  writeFileSync(paths.recordPath, JSON.stringify(writtenRecord));
  const sessionOptions = {
    orchestratorDirectory,
    runtimeExecutablePath:    process.execPath,
    dashboardEntryPointPath:  join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    startTimeoutMilliseconds: QUIET_MILLISECONDS,
    reconnectMilliseconds:    RECONNECT_MILLISECONDS,
    supervisorEnvironment:    {},
  };
  const sessions = createOrchestratorSessions({ role: 'orchestrator', ...sessionOptions });
  const productOwnerSessions = createOrchestratorSessions({ role: 'product-owner', ...sessionOptions });
  const options = {
    port:                      0,
    homeDirectory:             home,
    agentProgressExecutable:   null,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    dashboardDirectory:        join(import.meta.dir, '..', '..'),
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
    productOwnerSessions,
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
    productOwnerSessions,
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
  home:                 string;
  server:               RunningDashboardServer;
  sessions:             OrchestratorSessions;
  productOwnerSessions: OrchestratorSessions;
  launchToken:          string;
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
    dashboardDirectory:        join(import.meta.dir, '..', '..'),
    claudeExecutable:          fakeClaude,
    version:                   '0.0.0-example',
    clock:                     () => new Date(),
    machineParallelAgentLimit: 1,
  };
  const supervisorEnvironment = {
    PATH: ['/usr/bin', '/bin', dirname(process.execPath)].join(':'), HOME: home, AGENT_DASHBOARD_NO_BROWSER: '1', AGENT_DASHBOARD_CLAUDE: fakeClaude
  };
  const sessions = createDashboardOrchestratorSessions(options, supervisorEnvironment);
  const productOwnerSessions = createDashboardOrchestratorSessions(options, supervisorEnvironment, 'product-owner');
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
    productOwnerSessions,
    heartbeatIntervalMilliseconds:   60_000,
    handoffReplyTimeoutMilliseconds: QUIET_MILLISECONDS,
  });
  if (start.kind !== 'started') throw new Error('the server did not start');
  const { server } = start;
  const launchToken = (await (await fetch(`${server.url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
  return {
    home, server, sessions, productOwnerSessions, launchToken
  };
}

/** Stops the session and the server, and kills whatever a failed case left running before the scratch home goes. */
async function stopLiveSessionFixture(fixture: LiveSessionFixture): Promise<void> {
  await fetch(liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX), { method: 'DELETE', headers: liveLaunchHeaders(fixture) });
  await fetch(liveProjectPath(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_PATH_SUFFIX), { method: 'DELETE', headers: liveLaunchHeaders(fixture) });
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
  afterStartReply: OrchestratorSession;
  afterFirstReply: OrchestratorSession;
  question:        PendingQuestion;
}

/** Starts the session, waits for the board to be read, then asks after two replies naming `#133` and then `#134`. */
async function questionAskedAfterTwoReplies(fixture: LiveSessionFixture): Promise<AskedQuestion> {
  const orchestratorPath = liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX);
  const start = await fetch(orchestratorPath, { method: 'POST', headers: liveLaunchHeaders(fixture), body: '{"startBuilding":false}' });
  expect(start.status).toBe(201);
  const afterStartReply = await servedOrchestratorWhen(fixture, 'the start turn\'s reply', (session) => session.state === 'idle' && session.lastAction !== null);
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
  return { afterStartReply, afterFirstReply, question };
}

test('the served session\'s last action is the newest reply\'s tool call line as the conversation reads it, the start turn\'s first', async () => {
  const fixture = await startLiveSessionFixture(EXAMPLE_DISPATCHER_RUN_ID);
  try {
    const { afterStartReply, afterFirstReply } = await questionAskedAfterTwoReplies(fixture);
    const [startToolLine, firstChatToolLine] = fixture.sessions.conversationOf(TRACKER_ID).filter((message) => message.role === 'tool');
    expect(startToolLine?.text).toStartWith('Bash ');
    expect(afterStartReply.lastAction).toEqual({ at: startToolLine?.at ?? '', text: startToolLine?.text ?? '' });
    expect(afterFirstReply.lastAction).toEqual({ at: firstChatToolLine?.at ?? '', text: firstChatToolLine?.text ?? '' });
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

test('a record under the file name used before roles is recovered on server start as the orchestrator, never the product owner', async () => {
  const { server, sessions, productOwnerSessions } = await startFixture('before-roles');
  expect(sessions.sessionOf(TRACKER_ID)?.sessionId).toBe('example-session');
  expect(productOwnerSessions.sessionOf(TRACKER_ID)).toBeNull();
  const [project] = (await (await fetch(`${server.url}/api/snapshot`)).json() as DashboardSnapshot).projects;
  expect(project?.orchestrator?.sessionId).toBe('example-session');
  expect(project?.productOwner).toBeNull();
});

async function servedProductOwnerWhen(fixture: LiveSessionFixture, description: string, condition: (session: OrchestratorSession) => boolean): Promise<OrchestratorSession> {
  const deadline = performance.now() + LIVE_SESSION_WAIT_MILLISECONDS;
  for (;;) {
    const productOwner = (await servedSnapshotOf(fixture)).projects[0]?.productOwner ?? null;
    if (productOwner !== null && condition(productOwner)) return productOwner;
    if (performance.now() > deadline) throw new Error(`the served product owner never showed ${description}: ${JSON.stringify(productOwner)}`);
    await Bun.sleep(LIVE_SESSION_POLL_MILLISECONDS);
  }
}

/** The text of every user line the fake `claude` with this pid read, in order. */
function userTextsReadBy(fixture: LiveSessionFixture, sessionPid: number): string[] {
  return readFakeClaudeTranscript(fixture.home).flatMap((entry) => {
    if (entry.event !== 'stdin' || entry.pid !== sessionPid) return [];
    const line = JSON.parse(entry.line) as { type?: string; message?: { content?: unknown } };
    return line.type === 'user' ? [String(line.message?.content ?? '')] : [];
  });
}

/** A launch-granted request to the project's route; a body is JSON text. */
function sendTo(fixture: LiveSessionFixture, suffix: string, method: 'POST' | 'DELETE', body?: string): Promise<Response> {
  return fetch(liveProjectPath(fixture, suffix), { method, headers: liveLaunchHeaders(fixture), ...(body === undefined ? {} : { body }) });
}

function startProductOwner(fixture: LiveSessionFixture, body: string): Promise<Response> {
  return sendTo(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_PATH_SUFFIX, 'POST', body);
}

function stopProductOwner(fixture: LiveSessionFixture): Promise<Response> {
  return sendTo(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_PATH_SUFFIX, 'DELETE');
}

function chatWithProductOwner(fixture: LiveSessionFixture, chat: { text: string; sessionId?: string }): Promise<Response> {
  return sendTo(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_MESSAGES_PATH_SUFFIX, 'POST', JSON.stringify(chat));
}

/** Both roles live in the one project: the orchestrator started without the go to build, the product owner sparring. */
async function startBothRoles(fixture: LiveSessionFixture): Promise<{ orchestrator: OrchestratorSession; productOwner: OrchestratorSession }> {
  const orchestratorStart = await sendTo(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX, 'POST', '{"startBuilding":false}');
  expect(orchestratorStart.status).toBe(201);
  const productOwnerStart = await startProductOwner(fixture, '{"mode":"spar"}');
  expect(productOwnerStart.status).toBe(201);
  const started = await productOwnerStart.json() as OrchestratorSession;
  const productOwner = await servedProductOwnerWhen(fixture, 'idle after its brief', (session) => session.sessionId === started.sessionId && session.state === 'idle');
  const orchestrator = await servedOrchestratorWhen(fixture, 'idle', (session) => session.state === 'idle');
  return { orchestrator, productOwner };
}

test('a product owner starts beside a live orchestrator with 201, a second start while it lives is 409, and a bad body is 400', async () => {
  const fixture = await startLiveSessionFixture(null);
  try {
    expect((await servedSnapshotOf(fixture)).projects[0]?.productOwner).toBeNull();
    const { orchestrator, productOwner } = await startBothRoles(fixture);
    expect(productOwner.sessionId).not.toBe(orchestrator.sessionId);
    expect(fixture.sessions.isLive(TRACKER_ID)).toBe(true);
    const secondStart = await startProductOwner(fixture, '{"mode":"file"}');
    expect(secondStart.status).toBe(409);
    expect(await secondStart.text()).toBe('A dashboard-owned product owner of this project already runs');
    expect((await startProductOwner(fixture, '{"mode":"later"}')).status).toBe(400);
    expect((await startProductOwner(fixture, '{"startBuilding":true}')).status).toBe(400);
    const headersWithoutToken = { 'Origin': fixture.server.url, 'Content-Type': 'application/json' };
    const productOwnerPath = liveProjectPath(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_PATH_SUFFIX);
    const withoutToken = await fetch(productOwnerPath, { method: 'POST', headers: headersWithoutToken, body: '{"mode":"spar"}' });
    expect(withoutToken.status).toBe(403);
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

test('the product owner\'s first message is its brief: the spar brief carries the wrap-up rule and, after a stop, the file brief does not', async () => {
  const fixture = await startLiveSessionFixture(null);
  try {
    const { productOwner: sparring } = await startBothRoles(fixture);
    const sparBrief = productOwnerBriefTextOf('example-storefront', 'spar');
    await waitUntil(() => userTextsReadBy(fixture, sparring.pid).length > 0, 'the sparring product owner read its brief');
    expect(userTextsReadBy(fixture, sparring.pid)).toEqual([sparBrief]);
    expect(sparBrief.startsWith('/agent-po\n')).toBe(true);
    const namedInBrief = ['example-storefront', '`agent-progress-orchestrate`', 'never dispatch', 'never claim or start a ticket', `"${PRODUCT_OWNER_WRAP_UP_TEXT}"`];
    for (const named of namedInBrief) expect(sparBrief).toContain(named);

    expect((await stopProductOwner(fixture)).status).toBe(204);
    await servedProductOwnerWhen(fixture, 'ended', (session) => session.state === 'ended');
    expect(fixture.sessions.isLive(TRACKER_ID)).toBe(true);
    const fileStart = await startProductOwner(fixture, '{"mode":"file"}');
    expect(fileStart.status).toBe(201);
    const filing = await fileStart.json() as OrchestratorSession;
    await waitUntil(() => userTextsReadBy(fixture, filing.pid).length > 0, 'the filing product owner read its brief');
    const fileBrief = productOwnerBriefTextOf('example-storefront', 'file');
    expect(userTextsReadBy(fixture, filing.pid)).toEqual([fileBrief]);
    expect(fileBrief.startsWith('/agent-po\n')).toBe(true);
    expect(fileBrief).not.toContain(PRODUCT_OWNER_WRAP_UP_TEXT);
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

test('with both roles live, a product owner\'s chat, question, answer and events stay its own and the orchestrator reads nothing', async () => {
  const fixture = await startLiveSessionFixture(EXAMPLE_DISPATCHER_RUN_ID);
  try {
    const { orchestrator, productOwner } = await startBothRoles(fixture);
    const chatText = 'Let us shape #136';
    expect((await chatWithProductOwner(fixture, { text: chatText })).status).toBe(204);
    const replied = await servedProductOwnerWhen(fixture, 'the reply', (session) => session.state === 'idle'
      && fixture.productOwnerSessions.conversationOf(TRACKER_ID).some((message) => message.text === `${FAKE_REPLY_PREFIX}${chatText}`));
    expect(replied.lastAction?.text).toStartWith('Bash ');
    expect((await chatWithProductOwner(fixture, { text: 'Example', sessionId: orchestrator.sessionId })).status).toBe(409);

    expect((await chatWithProductOwner(fixture, { text: FAKE_ASK_MARKER })).status).toBe(204);
    const waiting = await servedProductOwnerWhen(fixture, 'the pending question', (session) => session.pendingQuestions.length > 0);
    expect(waiting.pendingQuestions[0]?.context).toEqual({
      dispatcherRunId:    EXAMPLE_DISPATCHER_RUN_ID,
      mentionedTicketIds: ['135', '136'],
      lastAssistantLine:  `${FAKE_REPLY_PREFIX}${chatText}`,
    });
    const answerBody = JSON.stringify({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Red' } });
    expect((await sendTo(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_ANSWERS_PATH_SUFFIX, 'POST', answerBody)).status).toBe(409);
    expect((await sendTo(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_ANSWERS_PATH_SUFFIX, 'POST', answerBody)).status).toBe(204);
    const tookTheAnswer = (): boolean => fixture.productOwnerSessions.conversationOf(TRACKER_ID).some((message) => message.text.startsWith(FAKE_ANSWERED_PREFIX));
    await waitUntil(tookTheAnswer, 'the product owner took the answer');

    const events = await firstEventsOf(await fetch(liveProjectPath(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_EVENTS_PATH_SUFFIX), { headers: { Origin: fixture.server.url } }));
    expect((events.history as ChatMessage[]).map((message) => message.text)).toContain(`${FAKE_REPLY_PREFIX}${chatText}`);
    expect((events.session as OrchestratorSession).sessionId).toBe(productOwner.sessionId);

    expect(userTextsReadBy(fixture, productOwner.pid)).toEqual([productOwnerBriefTextOf('example-storefront', 'spar'), chatText, FAKE_ASK_MARKER]);
    expect(readFakeClaudeTranscript(fixture.home).some((entry) => entry.event === 'started' && entry.pid === orchestrator.pid)).toBe(true);
    expect(userTextsReadBy(fixture, orchestrator.pid)).toEqual([orchestratorStartTextOf('example-storefront')]);
    const orchestratorTexts = fixture.sessions.conversationOf(TRACKER_ID).map((message) => message.text);
    expect(orchestratorTexts.filter((messageText) => messageText.includes(chatText) || messageText.includes(FAKE_ASK_MARKER))).toEqual([]);
    expect((await stopProductOwner(fixture)).status).toBe(204);
    const ended = await servedProductOwnerWhen(fixture, 'ended', (session) => session.state === 'ended');
    expect(ended.pendingQuestions).toEqual([]);
    expect((await servedSnapshotOf(fixture)).projects[0]?.orchestrator?.state).toBe('idle');
    expect((await chatWithProductOwner(fixture, { text: 'Example' })).status).toBe(409);
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

/** The `history` and the first `session` event of a conversation stream, then the stream closed. */
async function firstEventsOf(response: Response): Promise<{ history: unknown; session: unknown }> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  const decoder = new TextDecoder();
  const dataByEvent = new Map<string, unknown>();
  let unread = '';
  while (!dataByEvent.has('history') || !dataByEvent.has('session')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error('the event stream closed early');
    unread += decoder.decode(chunk.value, { stream: true });
    const blocks = unread.split('\n\n');
    unread = blocks.pop() ?? '';
    for (const block of blocks) {
      const eventLine = block.split('\n').find((line) => line.startsWith('event: '));
      const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
      if (eventLine !== undefined && dataLine !== undefined) dataByEvent.set(eventLine.slice('event: '.length), JSON.parse(dataLine.slice('data: '.length)));
    }
  }
  await reader.cancel();
  return { history: dataByEvent.get('history'), session: dataByEvent.get('session') };
}

test('Open in Claude app ends the session first, then runs claude --desktop --resume <id> under a terminal in the root, and the app\'s session is then watched', async () => {
  const fixture = await startLiveSessionFixture(EXAMPLE_DISPATCHER_RUN_ID);
  try {
    expect((await sendTo(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX, 'POST', '{"startBuilding":false}')).status).toBe(201);
    const orchestrator = await servedOrchestratorWhen(fixture, 'idle', (session) => session.state === 'idle');
    const opened = await sendTo(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_OPEN_IN_APP_PATH_SUFFIX, 'POST');
    expect(opened.status, await opened.clone().text()).toBe(204);

    const transcript = readFakeClaudeTranscript(fixture.home);
    const sessionEndIndex = transcript.findIndex((entry) => entry.event === 'stdin-closed');
    const desktopStartIndex = transcript.findIndex((entry) => entry.event === 'started' && entry.commandLineArguments.includes('--desktop'));
    const desktopStart = transcript[desktopStartIndex];
    expect(sessionEndIndex).toBeGreaterThanOrEqual(0);
    expect(desktopStartIndex).toBeGreaterThan(sessionEndIndex);
    expect(desktopStart?.event === 'started' ? desktopStart.commandLineArguments : []).toEqual(['--desktop', '--resume', orchestrator.sessionId]);
    expect(desktopStart?.event === 'started' ? desktopStart.directory : '').toBe(realpathSync(join(fixture.home, 'example-storefront')));
    expect(processIsAlive(orchestrator.pid)).toBe(false);

    const desktopSession = {
      pid: process.pid, sessionId: orchestrator.sessionId, cwd: join(fixture.home, 'example-storefront'), messagingSocketPath: join(fixture.home, 'desktop.sock')
    };
    writeExampleSessionRecord(fixture.home, desktopSession);
    createExampleWorkflowRun(fixture.home, desktopSession, EXAMPLE_DISPATCHER_RUN_ID);
    const snapshot = await servedSnapshotOf(fixture);
    expect(snapshot.projects[0]?.orchestrator).toBeNull();
    expect(snapshot.watchedOrchestratorsByTracker[TRACKER_ID]?.map((session) => [session.sessionId, session.ownership])).toEqual([[orchestrator.sessionId, 'watched']]);
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);

test('Open in Claude app refuses without the launch token, and with no live dashboard-owned session, starting nothing', async () => {
  const fixture = await startLiveSessionFixture(null);
  try {
    const openInAppPath = liveProjectPath(fixture, DASHBOARD_PROTOCOL.ORCHESTRATOR_OPEN_IN_APP_PATH_SUFFIX);
    expect((await fetch(openInAppPath, { method: 'POST', headers: { Origin: fixture.server.url } })).status).toBe(403);
    const withoutSession = await sendTo(fixture, DASHBOARD_PROTOCOL.PRODUCT_OWNER_OPEN_IN_APP_PATH_SUFFIX, 'POST');
    expect(withoutSession.status).toBe(404);
    expect(await withoutSession.text()).toBe('No dashboard-owned product owner of this project runs');
    expect(readFakeClaudeTranscript(fixture.home)).toEqual([]);
  } finally {
    await stopLiveSessionFixture(fixture);
  }
}, LIVE_SESSION_SPEC_TIMEOUT_MILLISECONDS);
