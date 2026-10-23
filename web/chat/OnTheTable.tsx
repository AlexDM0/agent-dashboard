import type { BoardSummary }                                  from '../../src/shared/DashboardContract.ts';
import { type SparPointState, type SparTable, SparTableUtil } from './SparTableUtil.ts';
import { TicketStatusPill }                                   from './TicketStatusPill.tsx';

interface OnTheTableProperties {
  table: SparTable | null;
  board: BoardSummary | null;
}

const POINT_GROUPS: { state: SparPointState; label: string }[] = [
  { state: 'agreed', label: 'Agreed' },
  { state: 'open', label: 'Open' },
  { state: 'parked', label: 'Parked' },
];

function TableContents({ table, board }: { table: SparTable; board: BoardSummary | null }) {
  return (
    <>
      {POINT_GROUPS.map(({ state, label }) => {
        const points = SparTableUtil.pointsInStateOf(table, state);
        return points.length === 0
          ? null
          : (
            <section key={state} className="ap-table-group" aria-label={`${label} points`}>
              <h4 className="ap-queue-label">{label} · {points.length}</h4>
              <ul className="ap-table-list">
                {points.map((point) => <li key={point.id} className="ap-table-point" data-state={state}>{point.text}</li>)}
              </ul>
            </section>
          );
      })}
      {table.draftTickets.length === 0
        ? null
        : (
          <section className="ap-table-group" aria-label="Tickets it would file">
            <h4 className="ap-queue-label">Would file at wrap-up · {table.draftTickets.length}</h4>
            <ul className="ap-table-list">
              {table.draftTickets.map((draft) => (
                <li key={draft.key} className="ap-table-draft">
                  <span className="ap-table-draft-title">{draft.title} <span className="ap-pill">{draft.type}</span></span>
                  <span className="muted ap-caption">{draft.summary}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      {table.referencedTicketIds.length === 0
        ? null
        : (
          <section className="ap-table-group" aria-label="Referenced tickets">
            <h4 className="ap-queue-label">Referenced</h4>
            <ul className="ap-table-list">
              {table.referencedTicketIds.map((ticketId) => (
                <li key={ticketId} className="ap-table-reference">
                  <TicketStatusPill ticketId={ticketId} status={SparTableUtil.referencedTicketStatusOf(board, ticketId)} />
                </li>
              ))}
            </ul>
          </section>
        )}
    </>
  );
}

/** The product owner's `spar-table`, display only; a missing or malformed one reads as an empty table. */
export function OnTheTable({ table, board }: OnTheTableProperties) {
  const isEmpty = table === null || (table.points.length === 0 && table.draftTickets.length === 0 && table.referencedTicketIds.length === 0);
  return (
    <section className="ap-chat-context-section" aria-label="On the table">
      <h3 className="ap-chat-context-title">On the table</h3>
      {isEmpty ? <p className="muted ap-caption">Nothing on the table yet</p> : <TableContents table={table} board={board} />}
    </section>
  );
}
