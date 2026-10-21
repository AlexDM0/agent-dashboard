import type { BoardSummary } from '../../src/shared/DashboardContract.ts';
import { ticketBarOf }       from './TicketBar.ts';

interface TicketStatusBarProperties {
  board: BoardSummary;
}

export function TicketStatusBar({ board }: TicketStatusBarProperties) {
  const bar = ticketBarOf(board.ticketCountByStatus, board.ticketTotal);
  return (
    <div className="ap-ticket-bar-block">
      <div className="ap-ticket-bar" role="img" aria-label={bar.caption}>
        {bar.segments.map((segment) => (
          <span key={segment.status} data-state={segment.status} style={{ width: `${segment.widthPercent}%` }} title={`${segment.count} ${segment.status}`} />
        ))}
      </div>
      <span className="mono muted ap-caption">{bar.caption}</span>
    </div>
  );
}
