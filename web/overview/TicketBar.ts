import type { TicketStatus } from '../../src/shared/DashboardContract.ts';

export interface TicketBarSegment {
  status:       TicketStatus;
  count:        number;
  widthPercent: number;
  /** The segment's word in the legend under the bar. */
  legendWord:   string;
}

export interface TicketBar {
  /** Only the statuses with tickets, so the legend drawn from them lists only non-zero parts. */
  segments:         TicketBarSegment[];
  caption:          string;
  /** `delivered/total` at the bar's end, abandoned tickets left out of the total. */
  deliveredOfTotal: string;
}

/** Done first, waiting last: the bar reads left to right as the work moves. Abandoned tickets are not shown. */
const SEGMENT_ORDER: readonly TicketStatus[] = ['delivered', 'reviewed', 'in-review', 'in-progress', 'pending'];

/** Only the statuses whose caption word differs from the value. */
const CAPTION_WORDS: Partial<Record<TicketStatus, string>> = {
  'in-review':   'in review',
  'in-progress': 'in progress',
};

/** Only the statuses whose legend word differs from the value. */
const LEGEND_WORDS: Partial<Record<TicketStatus, string>> = {
  'in-review':   'in review',
  'in-progress': 'building',
};

export function ticketBarOf(ticketCountByStatus: Record<TicketStatus, number>, ticketTotalWithAbandoned: number): TicketBar {
  const ticketTotal = Math.max(0, ticketTotalWithAbandoned - ticketCountByStatus.abandoned);
  const segments = SEGMENT_ORDER
    .filter((status) => ticketCountByStatus[status] > 0)
    .map((status) => ({
      status,
      count:        ticketCountByStatus[status],
      widthPercent: ticketTotal > 0 ? (ticketCountByStatus[status] / ticketTotal) * 100 : 0,
      legendWord:   LEGEND_WORDS[status] ?? status,
    }));
  const otherParts = segments
    .filter((segment) => segment.status !== 'delivered')
    .map((segment) => `${segment.count} ${CAPTION_WORDS[segment.status] ?? segment.status}`);
  const caption = ticketTotal === 0
    ? 'No tickets yet'
    : [`${ticketCountByStatus.delivered} of ${ticketTotal} delivered`, ...otherParts].join(' · ');
  return { segments, caption, deliveredOfTotal: `${ticketCountByStatus.delivered}/${ticketTotal}` };
}

/** Every ticket that is not abandoned is delivered, and nothing waits to be started. */
export function isAllDeliveredWithNothingReady(ticketCountByStatus: Record<TicketStatus, number>, ticketTotal: number, readyCount: number): boolean {
  return readyCount === 0 && ticketCountByStatus.delivered === ticketTotal - ticketCountByStatus.abandoned;
}
