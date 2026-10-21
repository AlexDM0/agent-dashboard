/**
 * Maps the document `agent-progress status --json --full` prints to the dashboard's `BoardSummary`, validating as it
 * goes: a value the CLI computes (slots, ready, held, the dispatcher state) is taken from it, never recomputed.
 */
import {
  type ActiveRow,
  type ActiveRowKind,
  type BoardSummary,
  type DispatcherState,
  type LogLine,
  type TicketStatus
} from '../shared/DashboardContract.ts';
import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_LIMITS } from '../shared/constants/DashboardLimits.ts';

export type BoardSummaryVerdict =
  | { kind: 'ready'; board: BoardSummary }
  | { kind: 'unreadable'; reason: string };

type JsonObject = Record<string, unknown>;

const DISPATCHER_STATES: readonly DispatcherState[] = ['running', 'finished', 'stopped'];

const TICKET_STATUSES: readonly TicketStatus[] = ['pending', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'];

const IN_PROGRESS_ROW_STATUS = 'in-progress';

function fieldOf(record: JsonObject, field: string): unknown {
  return Object.hasOwn(record, field) ? record[field] : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function objectsIn(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(UnknownValueUtil.isJsonObject) : [];
}

function stringsIn(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isDispatcherState(value: unknown): value is DispatcherState {
  return typeof value === 'string' && (DISPATCHER_STATES as readonly string[]).includes(value);
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value);
}

function emptyTicketCounts(): Record<TicketStatus, number> {
  return {
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  };
}

function ticketTitlesById(tickets: JsonObject[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const ticket of tickets) {
    const ticketId = stringOrNull(fieldOf(ticket, 'id'));
    const title = stringOrNull(fieldOf(ticket, 'title'));
    if (ticketId !== null && title !== null) titles.set(ticketId, title);
  }
  return titles;
}

function activeRowOf(row: JsonObject, ticketTitles: Map<string, string>): ActiveRow | null {
  const rowId = finiteNumberOrNull(fieldOf(row, 'id'));
  if (rowId === null || fieldOf(row, 'status') !== IN_PROGRESS_ROW_STATUS) return null;
  const reviewOf = stringOrNull(fieldOf(row, 'reviewOf'));
  const ownTicket = stringOrNull(fieldOf(row, 'ticket'));
  const kind: ActiveRowKind = reviewOf !== null ? 'review' : ownTicket !== null ? 'build' : 'task';
  const ticketId = reviewOf ?? ownTicket;
  const knownTitle = ticketId === null ? undefined : ticketTitles.get(ticketId);
  return {
    rowId,
    kind,
    ticketId,
    reviewRound: kind === 'review' ? finiteNumberOrNull(fieldOf(row, 'reviewBarRound')) : null,
    title:       knownTitle ?? stringOrNull(fieldOf(row, 'name')) ?? '',
    owner:       stringOrNull(fieldOf(row, 'owner')) ?? '',
    startedAt:   stringOrNull(fieldOf(row, 'start')),
    note:        stringOrNull(fieldOf(row, 'note')) ?? '',
  };
}

/** Oldest start first; a row without a start goes last, and the row id breaks a tie so the order is stable. */
function compareActiveRows(a: ActiveRow, b: ActiveRow): number {
  if (a.startedAt !== b.startedAt) {
    if (a.startedAt === null) return 1;
    if (b.startedAt === null) return -1;
    const startDifference = Date.parse(a.startedAt) - Date.parse(b.startedAt);
    if (startDifference !== 0 && !Number.isNaN(startDifference)) return startDifference;
  }
  return a.rowId - b.rowId;
}

/**
 * Newest first the way agent-progress orders it: by stamp, the later append first on a tie, since `--at` backfills
 * append out of order; a stamp that does not parse sorts oldest.
 */
function recentLogOf(log: JsonObject[]): LogLine[] {
  const datedLines: { line: LogLine; appendIndex: number; epochMilliseconds: number }[] = [];
  log.forEach((entry, appendIndex) => {
    const at = stringOrNull(fieldOf(entry, 'at'));
    const text = stringOrNull(fieldOf(entry, 'text'));
    if (at === null || text === null) return;
    const parsedMilliseconds = Date.parse(at);
    datedLines.push({ line: { at, text }, appendIndex, epochMilliseconds: Number.isNaN(parsedMilliseconds) ? Number.NEGATIVE_INFINITY : parsedMilliseconds });
  });
  datedLines.sort((a, b) => b.epochMilliseconds - a.epochMilliseconds || b.appendIndex - a.appendIndex);
  return datedLines.slice(0, DASHBOARD_LIMITS.RECENT_LOG_LINE_COUNT).map((datedLine) => datedLine.line);
}

/** The CLI lists a held ticket among the ready and review-waiting ones and names it in `heldTicketIds`; held is not startable. */
function withoutHeld(ticketIds: string[], heldTicketIds: string[]): string[] {
  return ticketIds.filter((ticketId) => !heldTicketIds.includes(ticketId));
}

function tokensTotalOf(tokensByOwner: unknown): number {
  if (!UnknownValueUtil.isJsonObject(tokensByOwner)) return 0;
  const ownerTokens = objectsIn(fieldOf(tokensByOwner, 'owners')).map((owner) => finiteNumberOrNull(fieldOf(owner, 'tokens')) ?? 0);
  const withoutOwner = fieldOf(tokensByOwner, 'withoutOwner');
  const withoutOwnerTokens = UnknownValueUtil.isJsonObject(withoutOwner) ? finiteNumberOrNull(fieldOf(withoutOwner, 'tokens')) ?? 0 : 0;
  return ownerTokens.reduce((sum, tokens) => sum + tokens, withoutOwnerTokens);
}

export function boardSummaryOf(document: unknown): BoardSummaryVerdict {
  if (!UnknownValueUtil.isJsonObject(document)) return { kind: 'unreadable', reason: 'status --json --full did not print a JSON object' };
  const concurrency = fieldOf(document, 'concurrency');
  if (!UnknownValueUtil.isJsonObject(concurrency)) return { kind: 'unreadable', reason: 'status --json --full printed no concurrency object' };

  const concurrencyLimit = finiteNumberOrNull(fieldOf(concurrency, 'limit'));
  const agentsInFlight = finiteNumberOrNull(fieldOf(concurrency, 'agentsInFlight'));
  const freeSlots = finiteNumberOrNull(fieldOf(concurrency, 'freeSlots'));
  if (concurrencyLimit === null || agentsInFlight === null || freeSlots === null) {
    return { kind: 'unreadable', reason: 'status --json --full printed no concurrency limit, agentsInFlight or freeSlots' };
  }
  const nestedDispatcherState = fieldOf(concurrency, 'dispatcherState');
  const topLevelDispatcherState = fieldOf(document, 'dispatcherState');
  const dispatcherState = isDispatcherState(nestedDispatcherState) ? nestedDispatcherState
    : isDispatcherState(topLevelDispatcherState) ? topLevelDispatcherState : null;
  if (dispatcherState === null) return { kind: 'unreadable', reason: 'status --json --full printed no known dispatcherState' };

  const tickets = objectsIn(fieldOf(document, 'tickets'));
  const ticketCountByStatus = emptyTicketCounts();
  for (const ticket of tickets) {
    const status = fieldOf(ticket, 'status');
    if (isTicketStatus(status)) ticketCountByStatus[status]++;
  }
  const ticketTitles = ticketTitlesById(tickets);
  const activeRows = objectsIn(fieldOf(document, 'tasks'))
    .map((row) => activeRowOf(row, ticketTitles))
    .filter((row): row is ActiveRow => row !== null)
    .sort(compareActiveRows);

  const heldTicketIds = stringsIn(fieldOf(concurrency, 'heldTicketIds'));
  const listedReviewWaitingTicketIds = objectsIn(fieldOf(document, 'reviewWaitingTickets'))
    .map((ticket) => stringOrNull(fieldOf(ticket, 'id')))
    .filter((ticketId): ticketId is string => ticketId !== null);

  return {
    kind:  'ready',
    board: {
      dispatcherState,
      concurrencyLimit,
      agentsInFlight,
      freeSlots,
      ticketCountByStatus,
      ticketTotal:            Object.values(ticketCountByStatus).reduce((sum, count) => sum + count, 0),
      activeRows,
      readyTicketIds:         withoutHeld(stringsIn(fieldOf(concurrency, 'readyTicketIds')), heldTicketIds),
      heldTicketIds,
      reviewWaitingTicketIds: withoutHeld(listedReviewWaitingTicketIds, heldTicketIds),
      pausedBuildCount:       objectsIn(fieldOf(document, 'pausedBuilds')).length,
      recentLog:              recentLogOf(objectsIn(fieldOf(document, 'log'))),
      tokensTotal:            tokensTotalOf(fieldOf(document, 'tokensByOwner')),
    },
  };
}
