import type { TicketStatus } from '../../src/shared/DashboardContract.ts';

export interface TicketBarSegment {
  status:       TicketStatus;
  count:        number;
  widthPercent: number;
}

export interface TicketBar {
  segments: TicketBarSegment[];
  caption:  string;
}

/** Done first, waiting last: the bar reads left to right as the work moves. */
const SEGMENT_ORDER: readonly TicketStatus[] = ['delivered', 'reviewed', 'in-review', 'in-progress', 'pending', 'abandoned'];

/** Only the statuses whose caption word differs from the value. */
const CAPTION_WORDS: Partial<Record<TicketStatus, string>> = {
  'in-review':   'in review',
  'in-progress': 'in progress',
};

export function ticketBarOf(ticketCountByStatus: Record<TicketStatus, number>, ticketTotal: number): TicketBar {
  const segments = SEGMENT_ORDER
    .filter((status) => ticketCountByStatus[status] > 0)
    .map((status) => ({ status, count: ticketCountByStatus[status], widthPercent: ticketTotal > 0 ? (ticketCountByStatus[status] / ticketTotal) * 100 : 0 }));
  const otherParts = segments
    .filter((segment) => segment.status !== 'delivered')
    .map((segment) => `${segment.count} ${CAPTION_WORDS[segment.status] ?? segment.status}`);
  const caption = ticketTotal === 0
    ? 'No tickets yet'
    : [`${ticketCountByStatus.delivered} of ${ticketTotal} delivered`, ...otherParts].join(' · ');
  return { segments, caption };
}
