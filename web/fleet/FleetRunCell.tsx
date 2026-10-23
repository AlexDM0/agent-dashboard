import type { BoardSummary, ProjectSnapshot }  from '../../src/shared/DashboardContract.ts';
import { type BoardCommand, BoardCommandUtil } from '../board/BoardCommandUtil.ts';
import { LowTicketPopover }                    from '../board/LowTicketPopover.tsx';
import { StartBuildingButton }                 from '../shell/StartBuildingButton.tsx';
import { StopDispatcherButton }                from '../shell/StopDispatcherButton.tsx';

interface FleetRunCellProperties {
  project:    ProjectSnapshot;
  board:      BoardSummary;
  onOpenChat: () => void;
}

function FleetCommandControl({ command, project, board }: { command: BoardCommand; project: ProjectSnapshot; board: BoardSummary }) {
  switch (command) {
    case 'start-building':
      return <StartBuildingButton trackerId={project.trackerId} projectName={project.project} />;
    case 'stop-dispatcher':
      return (
        <StopDispatcherButton
          trackerId={project.trackerId}
          projectName={project.project}
          dispatcherState={board.dispatcherState}
          agentsInFlight={board.agentsInFlight}
        />
      );
    case 'include-low-priority':
    case 'pick-up-low-priority':
      return (
        <LowTicketPopover
          trackerId={project.trackerId}
          projectName={project.project}
          label={BoardCommandUtil.lowPriorityLabelOf(board.dispatcherState, board.lowPriorityWaitingTickets.length)}
          waitingTickets={board.lowPriorityWaitingTickets}
        />
      );
  }
}

/** The board command bar's actions for the dispatcher's state, decided by the same helper, then Chat as an icon. */
export function FleetRunCell({ project, board, onOpenChat }: FleetRunCellProperties) {
  return (
    <div className="ap-fleet-cell ap-fleet-run" role="cell">
      {BoardCommandUtil.commandsOf(board.dispatcherState, board.lowPriorityWaitingTickets.length).map((command) => (
        <FleetCommandControl key={command} command={command} project={project} board={board} />
      ))}
      <button type="button" className="ap-control ap-icon-control" aria-label={`Chat with the orchestrator of ${project.project}`} title="Chat" onClick={onOpenChat}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      </button>
    </div>
  );
}
