import type { ActiveRow }    from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }        from '../constants/WebLimits.ts';
import { TimeUtil }          from '../time/TimeUtil.ts';
import { activeRowBadgeOf }  from './ActiveRowBadge.ts';
import { ticketReferenceOf } from './TicketReference.ts';

interface ActiveRowListProperties {
  activeRows: ActiveRow[];
  now:        number;
}

export function ActiveRowList({ activeRows, now }: ActiveRowListProperties) {
  const shownRows = activeRows.slice(0, WEB_LIMITS.MAXIMUM_SHOWN_ACTIVE_ROWS);
  const hiddenCount = activeRows.length - shownRows.length;
  return (
    <div className="ap-card-section ap-flight">
      <span className="ap-queue-label">In flight</span>
      <ul className="ap-flight-list">
        {shownRows.map((row) => {
          const badge = activeRowBadgeOf(row);
          return (
            <li key={row.rowId} className="ap-flight-row">
              <span className="ap-badge" data-state={badge.state}>{badge.label}</span>
              <span className="ap-flight-id">{row.ticketId === null ? '' : ticketReferenceOf(row.ticketId)}</span>
              <span className="ap-flight-title ellipsis" title={row.title}>{row.title}</span>
              <span className="ap-flight-meta">
                <span className="ap-flight-owner">{row.owner}</span>
                <span className="ap-flight-elapsed">{row.startedAt === null ? '' : TimeUtil.relativeAgeOfStamp(row.startedAt, now)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 ? <span className="mono muted ap-caption">+{hiddenCount} more</span> : null}
    </div>
  );
}
