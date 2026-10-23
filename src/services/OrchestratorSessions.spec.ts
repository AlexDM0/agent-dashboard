/**
 * The answer route over the real orchestrator sessions, connected to an in-process fake supervisor in a scratch home.
 * What matters: an answer claims its pending question in the same turn it checks it, so of two answers arriving while
 * the first delivery is still held in the socket, exactly one is delivered (204) and the other is refused (409); and a
 * delivery that fails puts the question back, so it stays pending and answerable.
 */
import { mkdirSync, writeFileSync }               from 'node:fs';
import { type Server, type Socket, createServer } from 'node:net';
import { join }                                   from 'node:path';
import { afterEach, expect, test }                from 'bun:test';

import type { OrchestratorRecord }                                              from '../adapters/OrchestratorRecordReader.ts';
import type { LaunchToken, PendingQuestion }                                    from '../shared/DashboardContract.ts';
import { orchestratorDirectoryOf, orchestratorFilePathsOf }                     from '../shared/OrchestratorFilePaths.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../testing/ExampleBoards.ts';
import { createShortScratchDirectory, removeScratchDirectory }                  from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                            from '../testing/WaitUntil.ts';
import { type RunningDashboardServer, serveDashboard }                          from './DashboardServer.ts';
import { type OrchestratorSessions, createOrchestratorSessions }                from './OrchestratorSessions.ts';
import { createProjectMonitor }                                                 from './ProjectMonitor.ts';

const TRACKER_ID = 'example-answers-tracker';
const RECONNECT_MILLISECONDS = 60_000;
const QUIET_MILLISECONDS = 50;
const EXAMPLE_INSTANT = new Date('2026-01-01T00:00:00.000Z');
// Far past what a Unix socket buffers, so its write stays unflushed and every write queued behind it waits too.
const SOCKET_FILLING_CHAT_CHARACTERS = 4_000_000;

const PENDING_QUESTION: PendingQuestion = {
  requestId: 'example-request',
  askedAt:   EXAMPLE_INSTANT.toISOString(),
  questions: [{
    question: 'Which example colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Red', description: 'Example red' }]
  }],
};
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
      kind: 'state', record, state: 'waiting-for-answer', context: null, pendingQuestions: [PENDING_QUESTION]
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
