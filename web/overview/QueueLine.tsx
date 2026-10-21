import type { BoardSummary } from '../../src/shared/DashboardContract.ts';
import { ticketReferenceOf } from './TicketReference.ts';

interface QueueLineProperties {
  board: BoardSummary;
}

interface QueueGroup {
  label:     string;
  state:     'pending' | 'in-review' | 'paused';
  ticketIds: string[];
}

export function queueGroupsOf(board: BoardSummary): QueueGroup[] {
  return [
    { label: 'Ready', state: 'pending' as const, ticketIds: board.readyTicketIds },
    { label: 'Awaiting review', state: 'in-review' as const, ticketIds: board.reviewWaitingTicketIds },
    { label: 'Held', state: 'paused' as const, ticketIds: board.heldTicketIds },
  ].filter((group) => group.ticketIds.length > 0);
}

export function QueueLine({ board }: QueueLineProperties) {
  const groups = queueGroupsOf(board);
  if (groups.length === 0) {
    return null;
  }
  return (
    <div className="ap-card-section ap-queue">
      {groups.map((group) => (
        <div key={group.label} className="ap-queue-group">
          <span className="ap-queue-label">{group.label}</span>
          {group.ticketIds.map((ticketId) => <span key={ticketId} className="ap-chip" data-state={group.state}>{ticketReferenceOf(ticketId)}</span>)}
        </div>
      ))}
    </div>
  );
}
