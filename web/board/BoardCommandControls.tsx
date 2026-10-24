import type { BoardSummary, ProjectSnapshot }  from '../../src/shared/DashboardContract.ts';
import { StartBuildingButton }                 from '../shell/StartBuildingButton.tsx';
import { StopDispatcherButton }                from '../shell/StopDispatcherButton.tsx';
import { type BoardCommand, BoardCommandUtil } from './BoardCommandUtil.ts';
import { LowTicketClearance }                  from './LowTicketClearance.tsx';

interface BoardCommandControlsProperties {
  project:         ProjectSnapshot;
  board:           BoardSummary;
  isStartPrimary?: boolean;
}

interface BoardCommandControlProperties {
  command:        BoardCommand;
  project:        ProjectSnapshot;
  board:          BoardSummary;
  isStartPrimary: boolean;
}

function BoardCommandControl({
  command, project, board, isStartPrimary
}: BoardCommandControlProperties) {
  switch (command) {
    case 'start-building':
      return <StartBuildingButton trackerId={project.trackerId} projectName={project.project} isPrimary={isStartPrimary} />;
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
        <LowTicketClearance
          trackerId={project.trackerId}
          projectName={project.project}
          label={BoardCommandUtil.lowPriorityLabelOf(board.dispatcherState, board.lowPriorityWaitingTickets.length)}
          waitingTickets={board.lowPriorityWaitingTickets}
        />
      );
  }
}

/** The dispatcher actions `BoardCommandUtil.commandsOf` gives for the board's state, as the command bar, Fleet and the overview draw them. */
export function BoardCommandControls({ project, board, isStartPrimary = false }: BoardCommandControlsProperties) {
  return BoardCommandUtil.commandsOf(board.dispatcherState, board.lowPriorityWaitingTickets.length).map((command) => (
    <BoardCommandControl key={command} command={command} project={project} board={board} isStartPrimary={isStartPrimary} />
  ));
}
