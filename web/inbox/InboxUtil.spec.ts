/**
 * The inbox gathers every question a live dashboard-owned orchestrator owes, across projects, oldest first, so the
 * longest wait is on top; an ended session's leftovers stay out. A question's context becomes only the rows it has
 * something for. An alert stands for a live dashboard-owned orchestrator at or past the critical share (84% one, 79%
 * none), carrying the refusal the server would give, and counts in the title beside the questions.
 */
import { expect, test }                                             from 'bun:test';
import type { OrchestratorState, PendingQuestion, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import {
  boardSummaryWith,
  contextUsageWith,
  EMPTY_QUESTION_CONTEXT,
  inboxSnapshotWith,
  MARKUP_INJECTION_LINE,
  orchestratorSessionWith,
  pendingQuestionWith,
  projectSnapshotWith
} from '../testing/SnapshotFixtures.ts';
import { InboxUtil } from './InboxUtil.ts';

function projectAsking(project: string, pendingQuestions: PendingQuestion[], state: OrchestratorState = 'waiting-for-answer'): ProjectSnapshot {
  return projectSnapshotWith(project, { orchestrator: orchestratorSessionWith({ state, pendingQuestions }) });
}

test('questions from every project come oldest first, each with its project', () => {
  const projects = [
    projectAsking('example-alpha', [pendingQuestionWith('alpha-late', '2026-10-21T10:05:00+02:00')]),
    projectAsking('example-beta', [pendingQuestionWith('beta-early', '2026-10-21T09:00:00+02:00')]),
  ];
  const entries = InboxUtil.entriesOf(projects);
  expect(entries.map((entry) => entry.pendingQuestion.requestId)).toEqual(['beta-early', 'alpha-late']);
  expect(entries.map((entry) => entry.project)).toEqual(['example-beta', 'example-alpha']);
  expect(entries[0]?.trackerId).toBe('tracker-example-beta');
});

test('an ended session and a project without one add nothing', () => {
  const projects = [
    projectAsking('example-ended', [pendingQuestionWith('left-over', '2026-10-21T09:00:00+02:00')], 'ended'),
    projectSnapshotWith('example-none'),
  ];
  expect(InboxUtil.entriesOf(projects)).toEqual([]);
});

test('a stamp that does not parse sorts last, and equal stamps by project then request', () => {
  const projects = [
    projectAsking('example-beta', [pendingQuestionWith('broken', 'not a stamp'), pendingQuestionWith('beta-tie', '2026-10-21T09:00:00+02:00')]),
    projectAsking('example-alpha', [pendingQuestionWith('alpha-tie', '2026-10-21T09:00:00+02:00')]),
  ];
  expect(InboxUtil.entriesOf(projects).map((entry) => entry.pendingQuestion.requestId)).toEqual(['alpha-tie', 'beta-tie', 'broken']);
});

test('a context with a run id, ids and a line gives Doing (run id cut to 8), Mentions and Said, in that order', () => {
  const rows = InboxUtil.contextRowsOf({ dispatcherRunId: 'run-0123456789abcdef', mentionedTicketIds: ['041', '133'], lastAssistantLine: MARKUP_INJECTION_LINE });
  expect(rows).toEqual([
    { kind: 'doing', dispatcherRunId: 'run-0123' },
    { kind: 'mentions', ticketIds: ['041', '133'] },
    { kind: 'said', line: MARKUP_INJECTION_LINE },
  ]);
});

test('a context with no run id, no ids and no line gives no rows, and each empty part is left out on its own', () => {
  expect(InboxUtil.contextRowsOf(EMPTY_QUESTION_CONTEXT)).toEqual([]);
  expect(InboxUtil.contextRowsOf({ dispatcherRunId: '', mentionedTicketIds: [], lastAssistantLine: '   ' })).toEqual([]);
  expect(InboxUtil.contextRowsOf({ ...EMPTY_QUESTION_CONTEXT, mentionedTicketIds: ['007'] })).toEqual([{ kind: 'mentions', ticketIds: ['007'] }]);
});

function projectAt(project: string, usedTokens: number, state: OrchestratorState = 'idle', contextWindowTokens: number | null = 100_000): ProjectSnapshot {
  return projectSnapshotWith(project, { orchestrator: orchestratorSessionWith({ state, context: contextUsageWith(usedTokens, contextWindowTokens) }) });
}

test('a live dashboard-owned orchestrator at 84% of a known window adds one alert; at 79% none', () => {
  const alerts = InboxUtil.alertsOf([projectAt('example-full', 84_000), projectAt('example-roomy', 79_000)]);
  expect(alerts.map((alert) => [alert.project, alert.contextPercent])).toEqual([['example-full', 84]]);
  expect(alerts[0]?.handoffRefusal).toBeNull();
});

test('an ended session, a watched one and an unknown window add no alert', () => {
  const watched = projectSnapshotWith('example-watched', { orchestrator: orchestratorSessionWith({ ownership: 'watched', context: contextUsageWith(90_000) }) });
  expect(InboxUtil.alertsOf([projectAt('example-ended', 90_000, 'ended'), watched, projectAt('example-unknown', 90_000, 'idle', null)])).toEqual([]);
});

test('the alert carries the refusal the server would give: a pending question, a busy session, a running dispatcher', () => {
  const pendingQuestions = [pendingQuestionWith('one', '2026-10-21T09:00:00+02:00')];
  const asker = orchestratorSessionWith({ state: 'waiting-for-answer', context: contextUsageWith(90_000), pendingQuestions });
  const asking = projectSnapshotWith('example-asking', { orchestrator: asker });
  const running = projectSnapshotWith('example-running', {
    health:       { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'running' }) },
    orchestrator: orchestratorSessionWith({ context: contextUsageWith(90_000) })
  });
  const refusals = InboxUtil.alertsOf([asking, projectAt('example-busy', 90_000, 'busy'), running]).map((alert) => alert.handoffRefusal);
  expect(refusals).toEqual([
    'A question of the orchestrator is pending; answer it before refreshing',
    'The orchestrator is busy; refresh once it is idle',
    'The board\'s dispatcher is running; refresh once it has stopped or finished',
  ]);
});

test('the title counts questions and alerts together', () => {
  const { projects } = inboxSnapshotWith();
  const waitingCount = InboxUtil.entriesOf(projects).length + InboxUtil.alertsOf(projects).length;
  expect(waitingCount).toBe(4);
  expect(InboxUtil.documentTitleOf(waitingCount, 'agent-dashboard')).toBe('(4) agent-dashboard');
});

test('the title carries the count while above zero and is bare at zero', () => {
  expect(InboxUtil.documentTitleOf(2, 'agent-dashboard')).toBe('(2) agent-dashboard');
  expect(InboxUtil.documentTitleOf(1, 'example-alpha · agent-dashboard')).toBe('(1) example-alpha · agent-dashboard');
  expect(InboxUtil.documentTitleOf(0, 'agent-dashboard')).toBe('agent-dashboard');
});
