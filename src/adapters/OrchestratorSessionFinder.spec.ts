/**
 * The lookup decides whose session a click reaches, so it must never guess: the session holding the board's dispatcher
 * run wins even beside others in the root, the root's only live session is the fallback, and zero or several candidates
 * are refusals. A record whose pid is gone, whose socket refuses or that is never the orchestrator (a dashboard-owned
 * product owner in the root) is no candidate, and a run id that is not a plain
 * folder name never steers the lookup. The watched list is the live holders of the run alone, wherever their folder:
 * never the dashboard-owned session, a gone pid, a root session without the run, nor anyone without a valid run id.
 * Everything lives under a scratch home with scratch socket listeners.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import {
  EXAMPLE_SESSION_STARTED_AT,
  type ExampleSession,
  type ExampleSessionListener,
  createExampleWorkflowRun,
  exitedProcessId,
  listenAsExampleSession,
  writeExampleSessionRecord
} from '../testing/ExampleClaudeSessions.ts';
import { createScratchDirectory, removeScratchDirectory }                                from '../testing/ScratchDirectory.ts';
import { type OrchestratorSessionVerdict, findOrchestratorSession, findWatchedSessions } from './OrchestratorSessionFinder.ts';
import { sessionSocketAccepts }                                                          from './SessionMessageWriter.ts';

const SOCKET_TIMEOUT_MILLISECONDS = 1_000;
const EXAMPLE_RUN_ID = 'example-run-1';

let scratchDirectory = '';
let homeDirectory = '';
let projectRoot = '';
let listeners: ExampleSessionListener[] = [];

beforeEach(() => {
  scratchDirectory = createScratchDirectory('finder');
  homeDirectory = join(scratchDirectory, 'home');
  projectRoot = join(scratchDirectory, 'example.storefront');
  mkdirSync(homeDirectory);
  mkdirSync(projectRoot);
  listeners = [];
});

afterEach(() => {
  for (const listener of listeners) listener.stop();
  removeScratchDirectory(scratchDirectory);
});

function liveSession(sessionId: string, cwd: string, pid = process.pid): ExampleSession {
  const listener = listenAsExampleSession(scratchDirectory, `s${listeners.length}`);
  listeners.push(listener);
  const session = {
    pid, sessionId, cwd, messagingSocketPath: listener.socketPath
  };
  writeExampleSessionRecord(homeDirectory, session);
  return session;
}

function find(dispatcherRunId: string | null, neverTheOrchestratorSessionIds: readonly string[] = []): Promise<OrchestratorSessionVerdict> {
  return findOrchestratorSession({
    homeDirectory,
    projectRoot,
    dispatcherRunId,
    socketAccepts:          (socketPath) => sessionSocketAccepts(socketPath, SOCKET_TIMEOUT_MILLISECONDS),
    isNeverTheOrchestrator: (session) => neverTheOrchestratorSessionIds.includes(session.sessionId),
  });
}

function foundSessionId(verdict: OrchestratorSessionVerdict): string {
  if (verdict.kind !== 'found') throw new Error(`expected a session, got: ${verdict.reason}`);
  return verdict.session.sessionId;
}

test('the session holding the board\'s dispatcher run is chosen over other sessions in the root, even from a worktree', async () => {
  liveSession('root-a', projectRoot);
  liveSession('root-b', projectRoot);
  const orchestrator = liveSession('orchestrator', join(projectRoot, '.claude', 'worktrees', 'example'));
  createExampleWorkflowRun(homeDirectory, orchestrator, EXAMPLE_RUN_ID);
  expect(foundSessionId(await find(EXAMPLE_RUN_ID))).toBe('orchestrator');
});

test('without a run match the only live session in the project root is chosen', async () => {
  liveSession('elsewhere', scratchDirectory);
  liveSession('in-root', projectRoot);
  expect(foundSessionId(await find(null))).toBe('in-root');
  expect(foundSessionId(await find('example-run-nobody-holds'))).toBe('in-root');
});

test('a session that is never the orchestrator, such as a product owner in the root, is no candidate, alone or beside another', async () => {
  liveSession('product-owner', projectRoot);
  expect((await find(null, ['product-owner'])).kind).toBe('refused');
  liveSession('in-root', projectRoot);
  expect(foundSessionId(await find(null, ['product-owner']))).toBe('in-root');
});

test('no candidate is a refusal saying so', async () => {
  liveSession('elsewhere', scratchDirectory);
  const verdict = await find(EXAMPLE_RUN_ID);
  expect(verdict.kind).toBe('refused');
  expect(verdict.kind === 'refused' ? verdict.reason : '').toContain('No live Claude Code session');
});

test('several sessions in the root without a run match are a refusal naming them, never a guess', async () => {
  liveSession('root-a', projectRoot);
  liveSession('root-b', projectRoot, process.ppid);
  const verdict = await find(null);
  expect(verdict.kind).toBe('refused');
  expect(verdict.kind === 'refused' ? verdict.reason : '').toContain('Several live Claude Code sessions');
});

test('several sessions holding the run are a refusal too', async () => {
  createExampleWorkflowRun(homeDirectory, liveSession('holder-a', projectRoot), EXAMPLE_RUN_ID);
  createExampleWorkflowRun(homeDirectory, liveSession('holder-b', projectRoot), EXAMPLE_RUN_ID);
  const verdict = await find(EXAMPLE_RUN_ID);
  expect(verdict.kind === 'refused' ? verdict.reason : '').toContain(`hold dispatcher run ${EXAMPLE_RUN_ID}`);
});

test('a record whose pid is gone is no candidate, so the live one in the root is chosen', async () => {
  const deadOrchestrator = liveSession('dead-orchestrator', projectRoot, await exitedProcessId());
  createExampleWorkflowRun(homeDirectory, deadOrchestrator, EXAMPLE_RUN_ID);
  liveSession('in-root', projectRoot);
  expect(foundSessionId(await find(EXAMPLE_RUN_ID))).toBe('in-root');
});

test('a record whose socket refuses the connection is no candidate', async () => {
  const silent = liveSession('silent', projectRoot);
  listeners.find((listener) => listener.socketPath === silent.messagingSocketPath)?.stop();
  liveSession('in-root', projectRoot);
  expect(foundSessionId(await find(null))).toBe('in-root');
});

test('a run id that is not a plain folder name is ignored rather than followed', async () => {
  const outside = liveSession('outside', scratchDirectory);
  createExampleWorkflowRun(homeDirectory, outside, EXAMPLE_RUN_ID);
  liveSession('in-root', projectRoot);
  expect(foundSessionId(await find(`../workflows/${EXAMPLE_RUN_ID}`))).toBe('in-root');
});

test('a missing sessions folder or a damaged record is no session, never a throw', async () => {
  expect((await find(null)).kind).toBe('refused');
  liveSession('in-root', projectRoot);
  await Bun.write(join(homeDirectory, '.claude', 'sessions', 'damaged.json'), '{ not json');
  await Bun.write(join(homeDirectory, '.claude', 'sessions', 'partial.json'), JSON.stringify({ pid: process.pid, cwd: projectRoot }));
  expect(foundSessionId(await find(null))).toBe('in-root');
});

function watchedSessionIds(dispatcherRunId: string | null, dashboardOwnedSessionId = ''): string[] {
  return findWatchedSessions({ homeDirectory, dispatcherRunId, isDashboardOwned: (session) => session.sessionId === dashboardOwnedSessionId })
    .map((session) => session.sessionId);
}

test('the watched sessions are every live run holder but the dashboard-owned, from any folder, with the name, status and start their records carry', async () => {
  const named = liveSession('watched-b', projectRoot);
  writeExampleSessionRecord(homeDirectory, named, { name: 'Example orchestrator', status: 'busy' });
  createExampleWorkflowRun(homeDirectory, named, EXAMPLE_RUN_ID);
  createExampleWorkflowRun(homeDirectory, liveSession('watched-a', join(projectRoot, '.claude', 'worktrees', 'example'), process.ppid), EXAMPLE_RUN_ID);
  createExampleWorkflowRun(homeDirectory, liveSession('dashboard-owned', projectRoot), EXAMPLE_RUN_ID);
  createExampleWorkflowRun(homeDirectory, liveSession('gone', projectRoot, await exitedProcessId()), EXAMPLE_RUN_ID);
  liveSession('root-without-run', projectRoot);

  const watched = findWatchedSessions({ homeDirectory, dispatcherRunId: EXAMPLE_RUN_ID, isDashboardOwned: (session) => session.sessionId === 'dashboard-owned' });
  expect(watched.map((session) => session.sessionId)).toEqual(['watched-a', 'watched-b']);
  expect(watched[1]).toMatchObject({ name: 'Example orchestrator', status: 'busy', startedAt: EXAMPLE_SESSION_STARTED_AT });
});

test('of two live sessions in the root only the one holding the run is watched', () => {
  createExampleWorkflowRun(homeDirectory, liveSession('orchestrator', projectRoot), EXAMPLE_RUN_ID);
  createExampleWorkflowRun(homeDirectory, liveSession('other-run', projectRoot), 'example-run-older');
  liveSession('ordinary', projectRoot);
  expect(watchedSessionIds(EXAMPLE_RUN_ID)).toEqual(['orchestrator']);
});

test('without a dispatcher run no session is watched, however many live in the root', () => {
  liveSession('root-a', projectRoot);
  createExampleWorkflowRun(homeDirectory, liveSession('root-b', projectRoot), EXAMPLE_RUN_ID);
  expect(watchedSessionIds(null)).toEqual([]);
});

test('a run id that is not a plain folder name watches no session, even one whose run folder it would reach', () => {
  createExampleWorkflowRun(homeDirectory, liveSession('holder', projectRoot), EXAMPLE_RUN_ID);
  expect(watchedSessionIds(EXAMPLE_RUN_ID)).toEqual(['holder']);
  expect(watchedSessionIds(`../workflows/${EXAMPLE_RUN_ID}`)).toEqual([]);
  expect(watchedSessionIds(`./${EXAMPLE_RUN_ID}`)).toEqual([]);
});
