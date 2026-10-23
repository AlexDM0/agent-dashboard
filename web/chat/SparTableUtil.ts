/**
 * The product owner's "On the table" state, read from the fenced `spar-table` block a sparring session ends a reply
 * with (the shape and validation `.agent-progress/evidence/043-table-protocol.md` recommends), and the status a
 * referenced ticket has on the snapshot's board.
 */
import type { BoardSummary, ChatMessage } from '../../src/shared/DashboardContract.ts';

export type SparPointState = 'agreed' | 'open' | 'parked';
export type DraftTicketType = 'ticket' | 'bug' | 'research';

export interface SparPoint { id: string; text: string; state: SparPointState }
export interface DraftTicket { key: string; title: string; type: DraftTicketType; summary: string }
export interface SparTable { points: SparPoint[]; draftTickets: DraftTicket[]; referencedTicketIds: string[] }

/** What the snapshot's board says of a ticket; `not-in-flight` when none of its lists holds it, `unknown` for an unreadable board. */
export type ReferencedTicketStatus = 'building' | 'reviewing' | 'review-waiting' | 'ready' | 'held' | 'low-priority-waiting' | 'not-in-flight' | 'unknown';

const POINT_STATES: readonly string[] = ['agreed', 'open', 'parked'] satisfies SparPointState[];
const DRAFT_TICKET_TYPES: readonly string[] = ['ticket', 'bug', 'research'] satisfies DraftTicketType[];
const TABLE_FENCE_PATTERN = /```spar-table[ \t]*\r?\n([\s\S]*?)\r?\n?```/gu;
const TICKET_ID_PATTERN = /^\d{3}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringField(record: Record<string, unknown>, field: string): boolean {
  return typeof record[field] === 'string';
}

function isPoint(value: unknown): value is SparPoint {
  return isRecord(value) && isStringField(value, 'id') && isStringField(value, 'text') && POINT_STATES.includes(String(value['state']));
}

function isDraftTicket(value: unknown): value is DraftTicket {
  return isRecord(value) && isStringField(value, 'key') && isStringField(value, 'title') && isStringField(value, 'summary')
    && DRAFT_TICKET_TYPES.includes(String(value['type']));
}

function isTicketId(value: unknown): value is string {
  return typeof value === 'string' && TICKET_ID_PATTERN.test(value);
}

/** One wrong entry rejects the whole block, so a half-valid table is never shown. */
function tableOfJson(jsonText: string): SparTable | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { points, draftTickets, referencedTicketIds } = parsed;
  if (!Array.isArray(points) || !Array.isArray(draftTickets) || !Array.isArray(referencedTicketIds)) return null;
  if (!points.every(isPoint) || !draftTickets.every(isDraftTicket) || !referencedTicketIds.every(isTicketId)) return null;
  return {
    points:       points.map(({ id, text, state }) => ({ id, text, state })),
    draftTickets: draftTickets.map(({
      key, title, type, summary
    }) => ({
      key, title, type, summary
    })),
    referencedTicketIds: [...referencedTicketIds],
  };
}

/** The table of a text's last `spar-table` fence; null when it has none or that fence is malformed. */
function tableOfText(text: string): SparTable | null {
  const fences = [...text.matchAll(TABLE_FENCE_PATTERN)];
  const lastFence = fences.at(-1);
  return lastFence === undefined ? null : tableOfJson(lastFence[1] ?? '');
}

/** The newest valid table any assistant message carries, so a broken block keeps the last good one; null for none. */
function latestTableOf(messages: ChatMessage[]): SparTable | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const table = message?.role === 'assistant' ? tableOfText(message.text) : null;
    if (table !== null) return table;
  }
  return null;
}

/** The conversation as it reads without the table blocks, which the panel shows instead; a reply holding only a block is left out. */
function messagesWithoutTablesOf(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role !== 'assistant' || !message.text.includes('```spar-table')) return [message];
    const text = message.text.replaceAll(TABLE_FENCE_PATTERN, '').trim();
    return text === '' ? [] : [{ ...message, text }];
  });
}

function pointsInStateOf(table: SparTable, state: SparPointState): SparPoint[] {
  return table.points.filter((point) => point.state === state);
}

function referencedTicketStatusOf(board: BoardSummary | null, ticketId: string): ReferencedTicketStatus {
  if (board === null) return 'unknown';
  const activeRow = board.activeRows.find((row) => row.ticketId === ticketId);
  if (activeRow !== undefined) return activeRow.kind === 'review' ? 'reviewing' : 'building';
  if (board.reviewWaitingTicketIds.includes(ticketId)) return 'review-waiting';
  if (board.readyTicketIds.includes(ticketId)) return 'ready';
  if (board.heldTicketIds.includes(ticketId)) return 'held';
  if (board.lowPriorityWaitingTickets.some((ticket) => ticket.ticketId === ticketId)) return 'low-priority-waiting';
  return 'not-in-flight';
}

export const SparTableUtil = Object.freeze({
  tableOfText,
  latestTableOf,
  messagesWithoutTablesOf,
  pointsInStateOf,
  referencedTicketStatusOf,
});
