import type { ReferencedTicketStatus } from './SparTableUtil.ts';

const STATUS_WORDS: Record<ReferencedTicketStatus, string> = {
  'building':             'building',
  'reviewing':            'in review',
  'review-waiting':       'waiting for review',
  'ready':                'ready',
  'held':                 'held',
  'low-priority-waiting': 'low priority, waiting',
  'not-in-flight':        'not in flight',
  'unknown':              'board unreadable',
};

const STATUS_PALETTE: Record<ReferencedTicketStatus, string> = {
  'building':             'in-progress',
  'reviewing':            'in-review',
  'review-waiting':       'in-review',
  'ready':                'pending',
  'held':                 'paused',
  'low-priority-waiting': 'pending',
  'not-in-flight':        'delivered',
  'unknown':              'abandoned',
};

/** A ticket's id and its status on the project's board, as the spar table and the Mentioned section list it. */
export function TicketStatusPill({ ticketId, status }: { ticketId: string; status: ReferencedTicketStatus }) {
  return (
    <>
      <span className="mono">#{ticketId}</span>
      <span className="ap-pill" data-state={STATUS_PALETTE[status]}>{STATUS_WORDS[status]}</span>
    </>
  );
}
