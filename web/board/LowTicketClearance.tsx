import type { WaitingTicket }        from '../../src/shared/DashboardContract.ts';
import { OrchestratorRequestButton } from '../shell/OrchestratorRequestButton.tsx';
import { BoardCommandUtil }          from './BoardCommandUtil.ts';

interface LowTicketClearanceProperties {
  trackerId:      string;
  projectName:    string;
  label:          string;
  waitingTickets: WaitingTicket[];
}

/** The command bar's low-priority control: one click asks the orchestrator to clear every waiting low ticket to run. */
export function LowTicketClearance({
  trackerId, projectName, label, waitingTickets
}: LowTicketClearanceProperties) {
  return (
    <OrchestratorRequestButton
      trackerId={trackerId}
      label={label}
      accessibleLabel={`Clear every low-priority ticket of ${projectName} to run`}
      isDisabled={waitingTickets.length === 0}
      orchestratorRequestOf={() => BoardCommandUtil.lowTicketClearRequestOf(waitingTickets)}
    />
  );
}
