/**
 * A refresh is due only for a live dashboard-owned orchestrator at or past the critical share of a known window: an
 * ended or watched session, an unknown window and a roomy context are never due, since the inbox and the Fleet both
 * key their alert on it. The refusal mirrors the server's, in its order and words, so the order of the checks matters.
 */
import { expect, test }                                             from 'bun:test';
import type { OrchestratorState, PendingQuestion, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import {
  boardSummaryWith,
  contextUsageWith,
  orchestratorSessionWith,
  pendingQuestionWith,
  projectSnapshotWith
} from '../testing/SnapshotFixtures.ts';
import { SessionRefreshUtil } from './SessionRefreshUtil.ts';

function projectAt(usedTokens: number, state: OrchestratorState = 'idle', contextWindowTokens: number | null = 100_000): ProjectSnapshot {
  return projectSnapshotWith('example-project', { orchestrator: orchestratorSessionWith({ state, context: contextUsageWith(usedTokens, contextWindowTokens) }) });
}

test('a live dashboard-owned orchestrator at 80% of a known window is due a refresh, at 79% it is not', () => {
  const due = projectAt(80_000);
  expect(SessionRefreshUtil.isRefreshDue(due)).toBe(true);
  expect(SessionRefreshUtil.refreshDueSessionOf(due)).toBe(due.orchestrator);
  expect(SessionRefreshUtil.isRefreshDue(projectAt(79_000))).toBe(false);
});

test('an ended session, a watched one, an unknown window and no session are never due', () => {
  const watched = projectSnapshotWith('example-watched', { orchestrator: orchestratorSessionWith({ ownership: 'watched', context: contextUsageWith(90_000) }) });
  const projects = [projectAt(90_000, 'ended'), watched, projectAt(90_000, 'idle', null), projectSnapshotWith('example-none')];
  expect(projects.map((project) => SessionRefreshUtil.refreshDueSessionOf(project))).toEqual([null, null, null, null]);
});

test('the live dashboard session is looked up per role, and an ended one counts as none', () => {
  const withProductOwner = projectSnapshotWith('example-owner', { productOwner: orchestratorSessionWith({ sessionId: 'product-owner-example' }) });
  expect(SessionRefreshUtil.liveDashboardSessionOf(withProductOwner, 'product-owner')).toBe(withProductOwner.productOwner);
  expect(SessionRefreshUtil.liveDashboardSessionOf(projectAt(10_000, 'ended'))).toBeNull();
});

function refusalOf(project: ProjectSnapshot): string | null {
  return project.orchestrator === null ? 'no session' : SessionRefreshUtil.handoffRefusalOf(project, project.orchestrator);
}

test('the refusal names a pending question first, then a session that is not idle, then the board', () => {
  const pendingQuestions: PendingQuestion[] = [pendingQuestionWith('one', '2026-10-21T09:00:00+02:00')];
  const askingWhileIdle = projectSnapshotWith('example-asking', { orchestrator: orchestratorSessionWith({ state: 'idle', pendingQuestions }) });
  const unreadable = projectSnapshotWith('example-unreadable', { health: { kind: 'unreadable', reason: 'Example reason' }, orchestrator: orchestratorSessionWith({}) });
  const running = projectSnapshotWith('example-running', {
    health:       { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'running' }) },
    orchestrator: orchestratorSessionWith({ state: 'busy' })
  });
  expect([askingWhileIdle, unreadable, running, projectAt(90_000, 'stopping')].map((project) => refusalOf(project))).toEqual([
    'A question of the orchestrator is pending; answer it before refreshing',
    'The board cannot be read, so whether its dispatcher runs is unknown',
    'The orchestrator is busy; refresh once it is idle',
    'The orchestrator is stopping; refresh once it is idle',
  ]);
});

test('an idle orchestrator on a readable board whose dispatcher is not running is never refused', () => {
  expect(refusalOf(projectAt(90_000))).toBeNull();
});
