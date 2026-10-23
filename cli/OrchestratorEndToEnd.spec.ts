/**
 * A dashboard-owned orchestrator through the real binary, under a scratch home with a fake `claude`: what matters is that
 * a start lacking the launch token or this server's own `Origin` spawns nothing, that the token never leaves through the
 * app shell, the log or the server record, that a started session runs in the project root in auto mode and is still
 * listed and reachable after the server process is killed and started again, and that a session ending, by Stop or by
 * itself, shows `ended` in the next snapshot, and that two simultaneous starts spawn one supervisor. Chat and answers
 * take the same token and Origin and write nothing when refused; a chat is the session's user turn, a stream opened late
 * replays the conversation in order, and a pending question is answered once, a second answer writing nothing. The
 * session's own `~/.claude/sessions/` record never lists it as watched, and a watched session borrows its context window.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join }                                  from 'node:path';
import {
  afterAll,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { readOrchestratorRecords } from '../src/adapters/OrchestratorRecordReader.ts';
import { processIsAlive }          from '../src/lib/process-liveness/ProcessIsAlive.ts';
import type {
  ChatMessage,
  DashboardSnapshot,
  LaunchToken,
  OrchestratorSession
} from '../src/shared/DashboardContract.ts';
import { orchestratorDirectoryOf }                                                 from '../src/shared/OrchestratorFilePaths.ts';
import { DASHBOARD_PROTOCOL }                                                      from '../src/shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry }    from '../src/testing/ExampleBoards.ts';
import { exampleAssistantLine, writeExampleSessionRecord, writeExampleTranscript } from '../src/testing/ExampleClaudeSessions.ts';
import {
  FAKE_ANSWERED_PREFIX,
  FAKE_ASK_MARKER,
  FAKE_CLAUDE_MODEL,
  FAKE_CONTEXT_WINDOW_TOKENS,
  FAKE_QUESTION,
  FAKE_QUESTION_REQUEST_ID,
  FAKE_REPLY_PREFIX,
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
const WATCHED_USED_TOKENS = 4_321;

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
  expect(request.status).toBe(200);
  expect(await request.json()).toEqual({ recipient: 'dashboard-session' });
  const startBuildingArrived = (): boolean => readFakeClaudeTranscript(home).some((entry) => entry.event === 'stdin' && entry.line.includes(PROJECT_NAME));
  await waitUntil(startBuildingArrived, 'the start-building message reached the session', SESSION_WAIT_MILLISECONDS);
  const answered = await waitForOrchestratorState('idle', (orchestrator) => orchestrator.context !== null);
  expect(answered.context).toMatchObject({ usedTokens: FAKE_USED_TOKENS, contextWindowTokens: FAKE_CONTEXT_WINDOW_TOKENS, model: FAKE_CLAUDE_MODEL });

  const ownRecord = {
    pid: startedEntry.pid, sessionId: started.sessionId, cwd: projectRoot, messagingSocketPath: join(home, 'own.sock')
  };
  const watchedRecord = {
    pid: process.pid, sessionId: 'example-watched', cwd: projectRoot, messagingSocketPath: join(home, 'watched.sock')
  };
  writeExampleSessionRecord(home, ownRecord);
  writeExampleSessionRecord(home, watchedRecord);
  writeExampleTranscript(home, watchedRecord, [exampleAssistantLine(FAKE_CLAUDE_MODEL, { input_tokens: WATCHED_USED_TOKENS }, '2026-10-22T10:00:00.000Z')]);
  const snapshot = await (await fetch(`${url}/api/snapshot`)).json() as DashboardSnapshot;
  const watched = snapshot.watchedOrchestratorsByTracker[TRACKER_ID] ?? [];
  expect(watched.map((session) => session.sessionId)).toEqual([watchedRecord.sessionId]);
  expect(watched[0]?.context).toMatchObject({ usedTokens: WATCHED_USED_TOKENS, contextWindowTokens: FAKE_CONTEXT_WINDOW_TOKENS });

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

interface ServerSentEvent { event: string; data: unknown }

interface OpenEventStream {
  events: ServerSentEvent[];
  waitFor(description: string, holds: (events: ServerSentEvent[]) => boolean): Promise<void>;
  close(): void;
}

async function openEventStream(response: Response): Promise<OpenEventStream> {
  const events: ServerSentEvent[] = [];
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  const decoder = new TextDecoder();
  let unread = '';
  void (async () => {
    for (;;) {
      const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
      if (chunk.done) return;
      unread += decoder.decode(chunk.value, { stream: true });
      const blocks = unread.split('\n\n');
      unread = blocks.pop() ?? '';
      for (const block of blocks) {
        const eventLine = block.split('\n').find((line) => line.startsWith('event: '));
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        if (eventLine !== undefined && dataLine !== undefined) events.push({ event: eventLine.slice('event: '.length), data: JSON.parse(dataLine.slice('data: '.length)) });
      }
    }
  })();
  return {
    events,
    waitFor: (description, holds) => waitUntil(() => holds(events), description, SESSION_WAIT_MILLISECONDS),
    close:   () => void reader.cancel().catch(() => {}),
  };
}

const conversationPath = (suffix: string): string => `${url}${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/${TRACKER_ID}${suffix}`;

function sessionStdinLines(): string[] {
  const latestStartIndex = readFakeClaudeTranscript(home).findLastIndex((entry) => entry.event === 'started');
  return readFakeClaudeTranscript(home).slice(latestStartIndex).flatMap((entry) => (entry.event === 'stdin' ? [entry.line] : []));
}

function chat(text: string, headers: Record<string, string> = launchHeaders()): Promise<Response> {
  return fetch(conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_MESSAGES_PATH_SUFFIX), { method: 'POST', headers, body: JSON.stringify({ text }) });
}

function answer(body: unknown, headers: Record<string, string> = launchHeaders()): Promise<Response> {
  return fetch(conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_ANSWERS_PATH_SUFFIX), { method: 'POST', headers, body: JSON.stringify(body) });
}

const chatMessagesOf = (events: ServerSentEvent[]): ChatMessage[] => events.flatMap((serverSentEvent) => {
  if (serverSentEvent.event === 'history') return serverSentEvent.data as ChatMessage[];
  return serverSentEvent.event === 'message' ? [serverSentEvent.data as ChatMessage] : [];
});

test('chat and answers without the launch token or this server\'s own Origin are 403 and write nothing; a foreign Origin may not open the stream', async () => {
  const start = await fetch(orchestratorPath, { method: 'POST', headers: launchHeaders(), body: '{"startBuilding":false}' });
  expect(start.status).toBe(201);
  await waitForOrchestratorState('idle');
  const refusedHeaders = [
    launchHeaders({ [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: null }),
    launchHeaders({ [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: 'not-the-token' }),
    launchHeaders({ Origin: null }),
    launchHeaders({ Origin: 'http://example.invalid' }),
  ];
  for (const headers of refusedHeaders) {
    expect((await chat('Hello from a page elsewhere', headers)).status).toBe(403);
    expect((await answer({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Red' } }, headers)).status).toBe(403);
  }
  const eventsPath = conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_EVENTS_PATH_SUFFIX);
  expect((await fetch(eventsPath, { headers: { Origin: 'http://example.invalid' } })).status).toBe(403);
  const allowedStream = await fetch(eventsPath, { headers: { Origin: url } });
  expect(allowedStream.status).toBe(200);
  expect([...allowedStream.headers.keys()].filter((name) => name.toLowerCase().startsWith('access-control-'))).toEqual([]);
  await allowedStream.body?.cancel();
  await Bun.sleep(200);
  expect(sessionStdinLines()).toEqual([]);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a body other than { text } or { requestId, answers } is 400, and an unknown tracker 404', async () => {
  const messagesPath = conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_MESSAGES_PATH_SUFFIX);
  for (const body of ['{"text":"   "}', '{"text":7}', '{"text":"Hi","extra":1}', 'not json', JSON.stringify({ text: 'x'.repeat(20_001) })]) {
    expect((await fetch(messagesPath, { method: 'POST', headers: launchHeaders(), body })).status).toBe(400);
  }
  for (const body of [{ requestId: FAKE_QUESTION_REQUEST_ID }, { requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: '' } }, { requestId: 1, answers: {} }]) {
    expect((await answer(body)).status).toBe(400);
  }
  const unknownMessagesPath = messagesPath.replace(TRACKER_ID, 'no-such-tracker');
  expect((await fetch(unknownMessagesPath, { method: 'POST', headers: launchHeaders(), body: '{"text":"Hi"}' })).status).toBe(404);
  expect((await fetch(conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_EVENTS_PATH_SUFFIX).replace(TRACKER_ID, 'no-such-tracker'), { headers: { Origin: url } })).status).toBe(404);
  expect(sessionStdinLines()).toEqual([]);
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a chat message reaches the session as a user turn, and a stream opened later replays the turns and tool calls in order', async () => {
  expect((await chat('  Hello from Alex Example  ')).status).toBe(204);
  const afterTurn = await waitForOrchestratorState('idle', (orchestrator) => orchestrator.context !== null);
  expect(afterTurn.context).toMatchObject({ usedTokens: FAKE_USED_TOKENS, contextWindowTokens: FAKE_CONTEXT_WINDOW_TOKENS, model: FAKE_CLAUDE_MODEL });
  expect(sessionStdinLines().map((line) => JSON.parse(line) as unknown)).toEqual([{ type: 'user', message: { role: 'user', content: 'Hello from Alex Example' } }]);

  const stream = await openEventStream(await fetch(conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_EVENTS_PATH_SUFFIX), { headers: { Origin: url } }));
  await stream.waitFor('the history and the session arrived', (events) => events.some((serverSentEvent) => serverSentEvent.event === 'session'));
  expect(stream.events[0]?.event).toBe('history');
  expect(chatMessagesOf(stream.events).map((message) => [message.role, message.text])).toEqual([
    ['user', 'Hello from Alex Example'],
    ['assistant', `${FAKE_REPLY_PREFIX}Hello from Alex Example`],
    ['tool', 'Bash {"command":"agent-progress status --json"}'],
  ]);
  expect((stream.events.find((serverSentEvent) => serverSentEvent.event === 'session')?.data as OrchestratorSession).sessionId).toBe(afterTurn.sessionId);
  stream.close();
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('a pending AskUserQuestion shows in the stream and the snapshot, one answer resolves it, and a second answer is 409 and writes nothing', async () => {
  const stream = await openEventStream(await fetch(conversationPath(DASHBOARD_PROTOCOL.ORCHESTRATOR_EVENTS_PATH_SUFFIX), { headers: { Origin: url } }));
  expect((await chat(`Please ${FAKE_ASK_MARKER}`)).status).toBe(204);
  const isWaitingSession = (serverSentEvent: ServerSentEvent): boolean => (
    serverSentEvent.event === 'session' && (serverSentEvent.data as OrchestratorSession).state === 'waiting-for-answer'
  );
  await stream.waitFor('the stream showed the pending question', (events) => events.some(isWaitingSession));
  const streamedSession = stream.events.find(isWaitingSession)?.data as OrchestratorSession;
  const expectedPending = { requestId: FAKE_QUESTION_REQUEST_ID, questions: [FAKE_QUESTION] };
  expect(streamedSession.pendingQuestions).toMatchObject([expectedPending]);
  expect(chatMessagesOf(stream.events).at(-1)?.text).toStartWith('AskUserQuestion ');
  const waiting = await waitForOrchestratorState('waiting-for-answer');
  expect(waiting.pendingQuestions).toMatchObject([expectedPending]);

  expect((await answer({ requestId: 'not-pending', answers: { [FAKE_QUESTION.question]: 'Red' } })).status).toBe(409);
  expect((await answer({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { 'A question not asked': 'Red' } })).status).toBe(409);
  expect((await answer({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Red' } })).status).toBe(204);
  expect((await answer({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Blue' } })).status).toBe(409);

  const answeredText = `${FAKE_ANSWERED_PREFIX}${JSON.stringify({ [FAKE_QUESTION.question]: 'Red' })}`;
  await stream.waitFor('the session continued with the answer', (events) => chatMessagesOf(events).some((message) => message.text === answeredText));
  const answeredSession = await waitForOrchestratorState('idle');
  expect(answeredSession.pendingQuestions).toEqual([]);
  expect(answeredSession.context?.usedTokens).toBe(FAKE_USED_TOKENS);
  await Bun.sleep(200);
  const controlResponses = sessionStdinLines().filter((line) => line.includes('"control_response"'));
  expect(controlResponses).toHaveLength(1);
  expect(controlResponses[0]).toContain('"Red"');
  stream.close();
}, END_TO_END_TIMEOUT_MILLISECONDS);

test('once the session has ended, a chat or an answer is 409', async () => {
  expect((await fetch(orchestratorPath, { method: 'DELETE', headers: launchHeaders() })).status).toBe(204);
  await waitForOrchestratorState('ended');
  const stdinLineCount = sessionStdinLines().length;
  expect((await chat('Hello after the end')).status).toBe(409);
  expect((await answer({ requestId: FAKE_QUESTION_REQUEST_ID, answers: { [FAKE_QUESTION.question]: 'Red' } })).status).toBe(409);
  expect(sessionStdinLines()).toHaveLength(stdinLineCount);
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
