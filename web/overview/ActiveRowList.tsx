import type { ActiveRow }    from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }        from '../constants/WebLimits.ts';
import { TimeUtil }          from '../time/TimeUtil.ts';
import { activeRowBadgeOf }  from './ActiveRowBadge.ts';
import { ticketReferenceOf } from './TicketReference.ts';

interface ActiveRowListProperties {
  activeRows: ActiveRow[];
  now:        number;
}

/** The rows share the list's column grid, so each column starts at the same x in every row. */
export function ActiveRowList({ activeRows, now }: ActiveRowListProperties) {
  const shownRows = activeRows.slice(0, WEB_LIMITS.MAXIMUM_SHOWN_ACTIVE_ROWS);
  const hiddenCount = activeRows.length - shownRows.length;
  return (
    <>
      <ul className="ap-flight-list">
        {shownRows.map((row) => {
          const badge = activeRowBadgeOf(row);
          return (
            <li key={row.rowId} className="ap-flight-row">
              <span className="ap-badge" data-state={badge.state}>{badge.label}</span>
              <span className="ap-flight-id">{row.ticketId === null ? '' : ticketReferenceOf(row.ticketId)}</span>
              <span className="ap-flight-title ellipsis" title={row.title}>{row.title}</span>
              <span className="ap-flight-owner">{row.owner}</span>
              <span className="ap-flight-elapsed">{row.startedAt === null ? '' : TimeUtil.relativeAgeOfStamp(row.startedAt, now)}</span>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 ? <span className="mono muted ap-caption">+{hiddenCount} more on the board</span> : null}
    </>
  );
}
