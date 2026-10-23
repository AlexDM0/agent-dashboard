import type { BoardSummary } from '../../src/shared/DashboardContract.ts';
import { ticketBarOf }       from './TicketBar.ts';

interface TicketStatusBarProperties {
  board:      BoardSummary;
  hasLegend?: boolean;
}

export function TicketStatusBar({ board, hasLegend = true }: TicketStatusBarProperties) {
  const bar = ticketBarOf(board.ticketCountByStatus, board.ticketTotal);
  return (
    <div className="ap-ticket-bar-block">
      <div className="ap-ticket-bar-line">
        <div className="ap-ticket-bar" role="img" aria-label={bar.caption}>
          {bar.segments.map((segment) => (
            <span key={segment.status} data-state={segment.status} style={{ width: `${segment.widthPercent}%` }} title={`${segment.count} ${segment.legendWord}`} />
          ))}
        </div>
        <span className="mono ap-ticket-bar-total">{bar.deliveredOfTotal}</span>
      </div>
      {hasLegend && bar.segments.length > 0
        ? (
          <ul className="ap-ticket-legend" aria-hidden="true">
            {bar.segments.map((segment) => (
              <li key={segment.status} className="ap-ticket-legend-item">
                <span className="ap-ticket-legend-swatch" data-state={segment.status} />
                <span className="mono">{segment.count}</span> {segment.legendWord}
              </li>
            ))}
          </ul>
        )
        : null}
    </div>
  );
}
