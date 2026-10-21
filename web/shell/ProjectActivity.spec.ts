/** The dot's four meanings, with agents in flight winning over the dispatcher state. */
import { expect, test }                          from 'bun:test';
import { boardSummaryWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { projectActivityOf }                     from './ProjectActivity.ts';

test('agents in flight are live, even with the dispatcher stopped', () => {
  const project = projectSnapshotWith('example-storefront', { health: { kind: 'ready', board: boardSummaryWith({ agentsInFlight: 1, dispatcherState: 'stopped' }) } });
  expect(projectActivityOf(project)).toBe('live');
});

test('a running dispatcher with no agent is waiting', () => {
  const project = projectSnapshotWith('example-storefront', { health: { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'running' }) } });
  expect(projectActivityOf(project)).toBe('waiting');
});

test('a finished board is idle', () => {
  expect(projectActivityOf(projectSnapshotWith('field-notes-app'))).toBe('idle');
});

test('an unreadable or missing board is an error', () => {
  expect(projectActivityOf(projectSnapshotWith('research-wiki', { health: { kind: 'unreadable', reason: 'exit 1' } }))).toBe('error');
  expect(projectActivityOf(projectSnapshotWith('research-wiki', { health: { kind: 'missing', reason: 'gone' } }))).toBe('error');
});
