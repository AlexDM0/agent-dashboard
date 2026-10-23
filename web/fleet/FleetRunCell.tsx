import type { BoardSummary, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { BoardCommandControls }               from '../board/BoardCommandControls.tsx';

interface FleetRunCellProperties {
  project:    ProjectSnapshot;
  board:      BoardSummary;
  onOpenChat: () => void;
}

/** The board command bar's actions for the dispatcher's state, drawn by the same component, then Chat as an icon. */
export function FleetRunCell({ project, board, onOpenChat }: FleetRunCellProperties) {
  return (
    <div className="ap-fleet-cell ap-fleet-run" role="cell">
      <BoardCommandControls project={project} board={board} />
      <button type="button" className="ap-control ap-icon-control" aria-label={`Chat with the orchestrator of ${project.project}`} title="Chat" onClick={onOpenChat}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      </button>
    </div>
  );
}
