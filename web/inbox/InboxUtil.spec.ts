/**
 * The inbox gathers every question a live dashboard-owned orchestrator owes, across projects, oldest first, so the
 * longest wait is on top; an ended session's leftovers stay out. The title carries the count only above zero.
 */
import { expect, test }                                                      from 'bun:test';
import type { OrchestratorState, PendingQuestion, ProjectSnapshot }          from '../../src/shared/DashboardContract.ts';
import { orchestratorSessionWith, pendingQuestionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { InboxUtil }                                                         from './InboxUtil.ts';

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

test('the title carries the count while above zero and is bare at zero', () => {
  expect(InboxUtil.documentTitleOf(2, 'agent-dashboard')).toBe('(2) agent-dashboard');
  expect(InboxUtil.documentTitleOf(1, 'example-alpha · agent-dashboard')).toBe('(1) example-alpha · agent-dashboard');
  expect(InboxUtil.documentTitleOf(0, 'agent-dashboard')).toBe('agent-dashboard');
});
