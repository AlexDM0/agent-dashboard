import { useId, useRef, useState } from 'react';
import type { WaitingTicket }      from '../../src/shared/DashboardContract.ts';
import { useDismissablePopover }   from '../popover/UseDismissablePopover.ts';
import { LowTicketClearance }      from './LowTicketClearance.tsx';

interface LowTicketPopoverProperties {
  trackerId:      string;
  projectName:    string;
  label:          string;
  waitingTickets: WaitingTicket[];
}

/** The command bar's low-priority control: the waiting list opens under it rather than widening the bar. */
export function LowTicketPopover({
  trackerId, projectName, label, waitingTickets
}: LowTicketPopoverProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const containerReference = useRef<HTMLDivElement | null>(null);
  const toggleReference = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useDismissablePopover({
    isOpen, containerReference, toggleReference, close: () => setIsOpen(false)
  });

  return (
    <div ref={containerReference} className="ap-low-ticket-popover">
      <button
        ref={toggleReference}
        type="button"
        className="ap-control"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        {label}
      </button>
      {isOpen
        ? (
          <div id={panelId} className="ap-low-ticket-panel">
            <LowTicketClearance trackerId={trackerId} projectName={projectName} waitingTickets={waitingTickets} />
          </div>
        )
        : null}
    </div>
  );
}
