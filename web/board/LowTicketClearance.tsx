import { useState }                  from 'react';
import type { WaitingTicket }        from '../../src/shared/DashboardContract.ts';
import { ticketReferenceOf }         from '../overview/TicketReference.ts';
import { OrchestratorRequestButton } from '../shell/OrchestratorRequestButton.tsx';
import { LowTicketSelectionUtil }    from './LowTicketSelectionUtil.ts';

interface LowTicketClearanceProperties {
  trackerId:      string;
  projectName:    string;
  waitingTickets: WaitingTicket[];
}

export function LowTicketClearance({ trackerId, projectName, waitingTickets }: LowTicketClearanceProperties) {
  const [pickedTicketIds, setPickedTicketIds] = useState<string[]>([]);
  if (waitingTickets.length === 0) return null;
  const selectedTicketIds = LowTicketSelectionUtil.stillWaitingSelectionOf(pickedTicketIds, waitingTickets);

  return (
    <fieldset className="ap-low-tickets">
      <legend className="ap-queue-label">Low priority, waiting</legend>
      <ul className="ap-low-ticket-list">
        {waitingTickets.map((waitingTicket) => (
          <li key={waitingTicket.ticketId}>
            <label className="ap-low-ticket">
              <input
                type="checkbox"
                checked={selectedTicketIds.includes(waitingTicket.ticketId)}
                onChange={() => setPickedTicketIds(LowTicketSelectionUtil.toggledSelectionOf(selectedTicketIds, waitingTicket.ticketId))}
              />
              <span className="mono">{ticketReferenceOf(waitingTicket.ticketId)}</span>
              <span className="ellipsis" title={waitingTicket.title}>{waitingTicket.title}</span>
            </label>
          </li>
        ))}
      </ul>
      <OrchestratorRequestButton
        trackerId={trackerId}
        label="Clear to run"
        accessibleLabel={`Clear the selected low-priority tickets of ${projectName} to run`}
        isDisabled={selectedTicketIds.length === 0}
        orchestratorRequestOf={() => LowTicketSelectionUtil.clearRequestOf(selectedTicketIds)}
        onSent={() => setPickedTicketIds([])}
      />
    </fieldset>
  );
}
