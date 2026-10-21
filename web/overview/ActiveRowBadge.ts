import type { ActiveRow } from '../../src/shared/DashboardContract.ts';

export interface ActiveRowBadge {
  state: 'in-progress' | 'reviewing' | 'pending';
  label: string;
}

export function activeRowBadgeOf(row: ActiveRow): ActiveRowBadge {
  switch (row.kind) {
    case 'build':
      return { state: 'in-progress', label: 'Building' };
    case 'review':
      return { state: 'reviewing', label: row.reviewRound === null ? 'Review' : `Review ${row.reviewRound}` };
    case 'task':
      return { state: 'pending', label: 'Task' };
  }
}
