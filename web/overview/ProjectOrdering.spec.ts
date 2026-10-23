/**
 * Which group a project lands in and in what order: activity is agents in flight or a running dispatcher, never an
 * unreadable board; each group is A to Z by name, ignoring case and the change stamp, ties stable by tracker id; the
 * search reads the name and the path; the Active filter drops the idle group entirely.
 */
import { describe, expect, test }                                      from 'bun:test';
import { boardSummaryWith, overviewSnapshotWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { ProjectOrdering }                                             from './ProjectOrdering.ts';

test('the overview fixture groups two active projects as cards and four idle ones as rows', () => {
  const groups = ProjectOrdering.grouped(overviewSnapshotWith().projects, 'all', '');
  expect(groups.active.map((project) => project.project)).toEqual(['example-invoice-service', 'example-storefront']);
  expect(groups.idle).toHaveLength(4);
});

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
  test('active and idle projects are each ordered A to Z by name, active ones never mixing into the idle group', () => {
    const groups = ProjectOrdering.grouped([unreadable, dispatching, idle, building], 'all', '');
    expect(groups.active.map((project) => project.project)).toEqual(['example-storefront', 'invoice-service']);
    expect(groups.idle.map((project) => project.project)).toEqual(['field-notes-app', 'research-wiki']);
    expect(groups.shownCount).toBe(4);
  });
  test('names sort case-insensitively, whatever order they last changed in', () => {
    const beta = projectSnapshotWith('beta', { lastChangedAt: '2026-10-21T12:00:00+02:00' });
    const alpha = projectSnapshotWith('Alpha', { lastChangedAt: '2026-10-19T08:00:00+02:00' });
    const gamma = projectSnapshotWith('gamma', { lastChangedAt: 'unknown' });
    expect(ProjectOrdering.grouped([gamma, beta, alpha], 'all', '').idle.map((project) => project.project))
      .toEqual(['Alpha', 'beta', 'gamma']);
  });
  test('projects with the same name keep a stable order by tracker id', () => {
    const second = projectSnapshotWith('example-app', { trackerId: 'tracker-2' });
    const first = projectSnapshotWith('Example-App', { trackerId: 'tracker-1' });
    expect(ProjectOrdering.grouped([second, first], 'all', '').idle).toEqual([first, second]);
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
});
