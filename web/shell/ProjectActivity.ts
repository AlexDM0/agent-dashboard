import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';

export type ProjectActivity = 'live' | 'waiting' | 'error' | 'idle';

/** Live with agents in flight, waiting when the dispatcher runs with none, error when the board cannot be read. */
export function projectActivityOf(project: ProjectSnapshot): ProjectActivity {
  if (project.health.kind !== 'ready') {
    return 'error';
  }
  if (project.health.board.agentsInFlight > 0) {
    return 'live';
  }
  return project.health.board.dispatcherState === 'running' ? 'waiting' : 'idle';
}
