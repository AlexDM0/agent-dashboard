/**
 * A notification is news: each of the four kinds is raised only by its transition between two snapshots, never by a
 * state that merely persists, and the first snapshot of a connection is a baseline that raises nothing, so a reconnect
 * never replays a burst. The gate keeps every notification away from a user who did not opt in, muted it or is looking.
 */
import { expect, test } from 'bun:test';
import type {
  ContextUsage,
  DashboardSnapshot,
  DispatcherState,
  OrchestratorSession,
  ProjectSnapshot
} from '../../src/shared/DashboardContract.ts';
import {
  boardSummaryWith,
  orchestratorSessionWith,
  pendingQuestionWith,
  projectSnapshotWith
} from '../testing/SnapshotFixtures.ts';
import { NotificationTransitionUtil } from './NotificationTransitionUtil.ts';

const CONTEXT_WINDOW_TOKENS = 200_000;
const ROOMY_TOKENS = 100_000;
const PAST_THRESHOLD_TOKENS = 170_000;
const QUESTION_ONE = pendingQuestionWith('request-one', '2026-10-21T10:00:00+02:00');

function snapshotOf(projects: ProjectSnapshot[], watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]> = {}): DashboardSnapshot {
  return {
    registry:                      { kind: 'ready' },
    registryPath:                  '/Users/alex.example/.agent-progress-monitor/projects.json',
    projects,
    generatedAt:                   '2026-10-21T10:00:00+02:00',
    machineParallelAgentLimit:     8,
    boardOrigin:                   'http://127.0.0.1:4711',
    boardBridgeUrl:                'http://127.0.0.1:4711/bridge',
    watchedOrchestratorsByTracker: Object.fromEntries(projects.map((project) => [project.trackerId, watchedOrchestratorsByTracker[project.trackerId] ?? []])),
  };
}

function projectWithDispatcher(dispatcherState: DispatcherState): ProjectSnapshot {
  return projectSnapshotWith('example-alpha', { health: { kind: 'ready', board: boardSummaryWith({ dispatcherState, dispatcherRunId: 'run-example' }) } });
}

function contextOf(usedTokens: number): ContextUsage {
  return {
    usedTokens, contextWindowTokens: CONTEXT_WINDOW_TOKENS, model: 'claude-example', measuredAt: '2026-10-21T10:00:00+02:00'
  };
}

function projectWithSession(overrides: Partial<OrchestratorSession>): ProjectSnapshot {
  return projectSnapshotWith('example-alpha', { orchestrator: orchestratorSessionWith(overrides) });
}

const OPEN_GATE = {
  optedIn: true, muted: false, permission: 'granted', tabFocused: false
} as const;

test('a question newly asked raises one notification naming its project and the question', () => {
  const previous = snapshotOf([projectWithSession({ state: 'busy' })]);
  const next = snapshotOf([projectWithSession({ state: 'waiting-for-answer', pendingQuestions: [pendingQuestionWith('request-one', '2026-10-21T10:00:00+02:00')] })]);
  expect(NotificationTransitionUtil.notificationsDueOf(previous, next)).toEqual([{
    kind:      'question-asked',
    trackerId: 'tracker-example-alpha',
    project:   'example-alpha',
    text:      'The orchestrator asks: Example question request-one?',
    tag:       'question-asked:tracker-example-alpha:request-one',
  }]);
});

test('a question already waiting in the previous snapshot raises nothing again', () => {
  const asking = projectWithSession({ state: 'waiting-for-answer', pendingQuestions: [pendingQuestionWith('request-one', '2026-10-21T10:00:00+02:00')] });
  expect(NotificationTransitionUtil.notificationsDueOf(snapshotOf([asking]), snapshotOf([asking]))).toEqual([]);
});

test('a running dispatcher that finished or stopped raises a notification saying which', () => {
  for (const endState of ['finished', 'stopped'] as const) {
    const due = NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithDispatcher('running')]), snapshotOf([projectWithDispatcher(endState)]));
    const described = due.map((notification) => [notification.kind, notification.project, notification.text]);
    expect(described).toEqual([['dispatcher-ended', 'example-alpha', `The dispatcher run ${endState}`]]);
  }
});

test('a dispatcher that was not running, or still runs, raises nothing', () => {
  expect(NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithDispatcher('finished')]), snapshotOf([projectWithDispatcher('stopped')]))).toEqual([]);
  expect(NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithDispatcher('running')]), snapshotOf([projectWithDispatcher('running')]))).toEqual([]);
});

test('a dashboard-owned orchestrator that ended raises a notification; one already ended, or replaced by another session, does not', () => {
  const due = NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithSession({ state: 'idle' })]), snapshotOf([projectWithSession({ state: 'ended' })]));
  expect(due.map((notification) => [notification.kind, notification.text])).toEqual([['orchestrator-ended', 'The orchestrator session ended']]);
  expect(NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithSession({ state: 'ended' })]), snapshotOf([projectWithSession({ state: 'ended' })]))).toEqual([]);
  const replaced = projectWithSession({ sessionId: 'session-fresh', state: 'starting', previousSessionId: 'session-example' });
  expect(NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithSession({ state: 'idle' })]), snapshotOf([replaced]))).toEqual([]);
});

test('a context that crossed the hand-off threshold raises a notification once, for the dashboard\'s session and a watched one alike', () => {
  const dueForOwn = NotificationTransitionUtil.notificationsDueOf(
    snapshotOf([projectWithSession({ context: contextOf(ROOMY_TOKENS) })]),
    snapshotOf([projectWithSession({ context: contextOf(PAST_THRESHOLD_TOKENS) })])
  );
  expect(dueForOwn.map((notification) => [notification.kind, notification.text])).toEqual([['context-past-threshold', 'The orchestrator\'s context is at 85% of 200k']]);

  const alpha = projectSnapshotWith('example-alpha');
  const watchedWith = (usedTokens: number): Record<string, OrchestratorSession[]> => {
    const watchedSession = orchestratorSessionWith({ ownership: 'watched', sessionId: 'session-watched', context: contextOf(usedTokens) });
    return { [alpha.trackerId]: [watchedSession] };
  };
  const dueForWatched = NotificationTransitionUtil.notificationsDueOf(snapshotOf([alpha], watchedWith(ROOMY_TOKENS)), snapshotOf([alpha], watchedWith(PAST_THRESHOLD_TOKENS)));
  expect(dueForWatched.map((notification) => notification.text)).toEqual(['A watched session\'s context is at 85% of 200k']);

  const stillPast = snapshotOf([projectWithSession({ context: contextOf(PAST_THRESHOLD_TOKENS) })]);
  expect(NotificationTransitionUtil.notificationsDueOf(stillPast, stillPast)).toEqual([]);
});

test('the first snapshot of a connection is a baseline and raises nothing, however much needs the user', () => {
  const everythingAtOnce = snapshotOf([projectSnapshotWith('example-alpha', {
    health:       { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'stopped' }) },
    orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', context: contextOf(PAST_THRESHOLD_TOKENS), pendingQuestions: [QUESTION_ONE] }),
  })]);
  expect(NotificationTransitionUtil.notificationsDueOf(null, everythingAtOnce)).toEqual([]);
});

test('an unchanged snapshot raises nothing', () => {
  const busyBeta = projectSnapshotWith('example-beta', { orchestrator: orchestratorSessionWith({ state: 'busy', context: contextOf(ROOMY_TOKENS) }) });
  const snapshot = snapshotOf([projectWithDispatcher('running'), busyBeta]);
  expect(NotificationTransitionUtil.notificationsDueOf(snapshot, structuredClone(snapshot))).toEqual([]);
});

test('a question is news by its request id alone, so one in a project new to the snapshot is raised too', () => {
  const asking = projectSnapshotWith('example-beta', { orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [QUESTION_ONE] }) });
  const due = NotificationTransitionUtil.notificationsDueOf(snapshotOf([projectWithDispatcher('running')]), snapshotOf([projectWithDispatcher('running'), asking]));
  expect(due.map((notification) => notification.kind)).toEqual(['question-asked']);
});

test('only an opted-in, unmuted user who granted permission and is away from the tab is notified', () => {
  expect(NotificationTransitionUtil.mayRaise(OPEN_GATE)).toBe(true);
  expect(NotificationTransitionUtil.mayRaise({ ...OPEN_GATE, optedIn: false })).toBe(false);
  expect(NotificationTransitionUtil.mayRaise({ ...OPEN_GATE, muted: true })).toBe(false);
  expect(NotificationTransitionUtil.mayRaise({ ...OPEN_GATE, tabFocused: true })).toBe(false);
  for (const permission of ['default', 'denied', 'unsupported'] as const) {
    expect(NotificationTransitionUtil.mayRaise({ ...OPEN_GATE, permission })).toBe(false);
  }
});
