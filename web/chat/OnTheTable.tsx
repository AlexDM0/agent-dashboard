import type { BoardSummary } from '../../src/shared/DashboardContract.ts';
import { DispatcherPill }    from '../shell/DispatcherPill.tsx';
import { SlotMeter }         from '../shell/SlotMeter.tsx';
import {
  type ReferencedTicketStatus,
  type SparPointState,
  type SparTable,
  SparTableUtil
} from './SparTableUtil.ts';

interface OnTheTableProperties {
  table: SparTable | null;
  board: BoardSummary | null;
}

const POINT_GROUPS: { state: SparPointState; label: string }[] = [
  { state: 'agreed', label: 'Agreed' },
  { state: 'open', label: 'Open' },
  { state: 'parked', label: 'Parked' },
];

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

function TableContents({ table, board }: { table: SparTable; board: BoardSummary | null }) {
  return (
    <>
      {POINT_GROUPS.map(({ state, label }) => {
        const points = SparTableUtil.pointsInStateOf(table, state);
        return points.length === 0
          ? null
          : (
            <section key={state} className="ap-table-group" aria-label={`${label} points`}>
              <h3 className="ap-queue-label">{label} · {points.length}</h3>
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
            <h3 className="ap-queue-label">Would file at wrap-up · {table.draftTickets.length}</h3>
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
            <h3 className="ap-queue-label">Referenced</h3>
            <ul className="ap-table-list">
              {table.referencedTicketIds.map((ticketId) => {
                const status = SparTableUtil.referencedTicketStatusOf(board, ticketId);
                return (
                  <li key={ticketId} className="ap-table-reference">
                    <span className="mono">#{ticketId}</span>
                    <span className="ap-pill" data-state={STATUS_PALETTE[status]}>{STATUS_WORDS[status]}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
    </>
  );
}

/** The product owner's table, display only; a missing or malformed one reads as an empty table. */
export function OnTheTable({ table, board }: OnTheTableProperties) {
  const isEmpty = table === null || (table.points.length === 0 && table.draftTickets.length === 0 && table.referencedTicketIds.length === 0);
  return (
    <aside className="ap-chat-column ap-chat-table-column" aria-label="On the table">
      <h2 className="ap-chat-column-title">On the table</h2>
      {board === null
        ? null
        : (
          <div className="ap-table-board">
            <DispatcherPill dispatcherState={board.dispatcherState} />
            <SlotMeter concurrencyLimit={board.concurrencyLimit} busyCount={board.agentsInFlight} compact />
          </div>
        )}
      {isEmpty ? <p className="muted ap-caption">Nothing on the table yet</p> : <TableContents table={table} board={board} />}
    </aside>
  );
}
