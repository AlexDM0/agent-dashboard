/**
 * Which group a project lands in and in what order: activity is agents in flight or a running dispatcher, never an
 * unreadable board; the order compares instants, so stamps in different offsets sort by when they happened; the
 * search reads the name and the path; the Active filter drops the idle group entirely.
 */
import { describe, expect, test }                from 'bun:test';
import { boardSummaryWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { ProjectOrdering }                       from './ProjectOrdering.ts';

const building = projectSnapshotWith('example-storefront', {
  lastChangedAt: '2026-10-21T10:00:00+02:00',
  health:        { kind: 'ready', board: boardSummaryWith({ agentsInFlight: 1, dispatcherState: 'finished' }) },
});
const dispatching = projectSnapshotWith('invoice-service', {
  lastChangedAt: '2026-10-21T09:30:00+00:00',
  health:        { kind: 'ready', board: boardSummaryWith({ dispatcherState: 'running' }) },
});
const idle = projectSnapshotWith('field-notes-app', { lastChangedAt: '2026-10-19T10:00:00+02:00' });
const unreadable = projectSnapshotWith('research-wiki', {
  lastChangedAt: '2026-10-21T11:00:00+02:00',
  health:        { kind: 'unreadable', reason: 'agent-progress status exited 1' },
});

describe('isActive', () => {
  test('agents in flight make a project active', () => {
    expect(ProjectOrdering.isActive(building)).toBe(true);
  });
  test('a running dispatcher with no agent makes a project active', () => {
    expect(ProjectOrdering.isActive(dispatching)).toBe(true);
  });
  test('a finished board with nothing in flight is idle', () => {
    expect(ProjectOrdering.isActive(idle)).toBe(false);
  });
  test('an unreadable board is never active', () => {
    expect(ProjectOrdering.isActive(unreadable)).toBe(false);
  });
});

describe('grouped', () => {
  test('active and idle projects are each ordered most recently changed first, by instant', () => {
    const groups = ProjectOrdering.grouped([idle, building, unreadable, dispatching], 'all', '');
    expect(groups.active.map((project) => project.project)).toEqual(['invoice-service', 'example-storefront']);
    expect(groups.idle.map((project) => project.project)).toEqual(['research-wiki', 'field-notes-app']);
    expect(groups.shownCount).toBe(4);
  });
  test('the Active filter leaves the idle group empty', () => {
    const groups = ProjectOrdering.grouped([idle, building, unreadable], 'active', '');
    expect(groups.idle).toEqual([]);
    expect(groups.shownCount).toBe(1);
  });
  test('the search matches the name or the path, ignoring case and surrounding space', () => {
    expect(ProjectOrdering.grouped([idle, building], 'all', '  NOTES ').shownCount).toBe(1);
    expect(ProjectOrdering.grouped([idle, building], 'all', 'alex.example/development/example-store').active).toEqual([building]);
  });
  test('an unparsable change stamp sorts last', () => {
    const undated = projectSnapshotWith('example-agency-site', { lastChangedAt: 'unknown' });
    expect(ProjectOrdering.grouped([undated, idle], 'all', '').idle.map((project) => project.project))
      .toEqual(['field-notes-app', 'example-agency-site']);
  });
});
