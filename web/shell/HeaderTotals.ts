import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';

export interface HeaderTotals {
  projectCount:       number;
  agentsInFlight:     number;
  readyCount:         number;
  reviewWaitingCount: number;
  heldCount:          number;
}

/** Sums what each readable board's own summary says; an unreadable or missing project counts only as a project. */
export function headerTotalsOf(projects: ProjectSnapshot[]): HeaderTotals {
  const totals: HeaderTotals = {
    projectCount: projects.length, agentsInFlight: 0, readyCount: 0, reviewWaitingCount: 0, heldCount: 0
  };
  for (const project of projects) {
    if (project.health.kind === 'ready') {
      const { board } = project.health;
      totals.agentsInFlight += board.agentsInFlight;
      totals.readyCount += board.readyTicketIds.length;
      totals.reviewWaitingCount += board.reviewWaitingTicketIds.length;
      totals.heldCount += board.heldTicketIds.length;
    }
  }
  return totals;
}
