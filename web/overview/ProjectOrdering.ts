import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';

export type ProjectFilter = 'all' | 'active';

export interface ProjectGroups {
  active:     ProjectSnapshot[];
  idle:       ProjectSnapshot[];
  shownCount: number;
}

function isActive(project: ProjectSnapshot): boolean {
  if (project.health.kind !== 'ready') {
    return false;
  }
  const { board } = project.health;
  return board.agentsInFlight > 0 || board.dispatcherState === 'running';
}

function matchesSearch(project: ProjectSnapshot, searchText: string): boolean {
  const needle = searchText.trim().toLowerCase();
  return needle === '' || project.project.toLowerCase().includes(needle) || project.root.toLowerCase().includes(needle);
}

function alphabeticalByName(projects: ProjectSnapshot[]): ProjectSnapshot[] {
  return projects.toSorted((a, b) =>
    a.project.localeCompare(b.project, undefined, { sensitivity: 'base' }) || a.trackerId.localeCompare(b.trackerId));
}

function grouped(projects: ProjectSnapshot[], filter: ProjectFilter, searchText: string): ProjectGroups {
  const shown = projects.filter((project) => matchesSearch(project, searchText) && (filter === 'all' || isActive(project)));
  const ordered = alphabeticalByName(shown);
  return {
    active:     ordered.filter((project) => isActive(project)),
    idle:       ordered.filter((project) => !isActive(project)),
    shownCount: shown.length,
  };
}

export const ProjectOrdering = Object.freeze({
  isActive, matchesSearch, alphabeticalByName, grouped
});
