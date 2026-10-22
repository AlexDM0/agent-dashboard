/**
 * The mapper meets a document another tool prints, so it is held against one captured from a real scratch tracker
 * (`src/adapters/testing/ScratchTrackerStatusDocument.json`, retaken by running `agent-progress init` in a temp folder,
 * filing five tickets, claiming, reviewing, abandoning, holding, and capturing `status --json --full`) and against edge
 * documents: the dispatcher-state fallback, held tickets left out of the startable lists, the log's stamp order,
 * unknown statuses, damaged rows and log entries, the log cap, and the shapes that are unreadable. It never throws,
 * whatever it is handed.
 */
import { join }                    from 'node:path';
import { beforeAll, expect, test } from 'bun:test';

import { type BoardSummary } from '../shared/DashboardContract.ts';
import { boardSummaryOf }    from './BoardSummaryMapper.ts';

let capturedDocument: Record<string, unknown> = {};

beforeAll(async () => {
  capturedDocument = await Bun.file(join(import.meta.dir, 'testing', 'ScratchTrackerStatusDocument.json')).json() as Record<string, unknown>;
});

function readyBoardOf(document: unknown): BoardSummary {
  const verdict = boardSummaryOf(document);
  if (verdict.kind !== 'ready') throw new Error(`expected a ready board, got: ${verdict.reason}`);
  return verdict.board;
}

function minimalDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    concurrency: {
      limit: 2, agentsInFlight: 0, freeSlots: 2, readyTicketIds: [], dispatcherState: 'stopped', heldTicketIds: []
    },
    ...overrides,
  };
}

test('the captured scratch tracker maps to the summary its board shows', () => {
  expect(readyBoardOf(capturedDocument)).toEqual({
    dispatcherState:     'stopped',
    concurrencyLimit:    2,
    agentsInFlight:      3,
    freeSlots:           0,
    ticketCountByStatus: {
      'pending': 2, 'in-progress': 1, 'in-review': 1, 'reviewed': 0, 'delivered': 0, 'abandoned': 1
    },
    ticketTotal: 5,
    activeRows:  [
      {
        rowId:       1,
        kind:        'build',
        ticketId:    '001',
        reviewRound: null,
        title:       'Add the example checkout page',
        owner:       'opus',
        startedAt:   '2026-10-21T19:56:09+02:00',
        note:        '',
      },
      {
        rowId:       4,
        kind:        'review',
        ticketId:    '002',
        reviewRound: 1,
        title:       'Fix the example cart total',
        owner:       'opus',
        startedAt:   '2026-10-21T20:16:10+02:00',
        note:        '',
      },
      {
        rowId:       5,
        kind:        'task',
        ticketId:    null,
        reviewRound: null,
        title:       'Example free-standing chore',
        owner:       'Alex Example',
        startedAt:   '2026-10-21T20:21:10+02:00',
        note:        '',
      },
    ],
    readyTicketIds:         ['005'],
    heldTicketIds:          ['003'],
    reviewWaitingTicketIds: [],
    pausedBuildCount:       0,
    recentLog:              [
      { at: '2026-10-21T20:26:19+02:00', text: 'Ticket #005 filed: Example ready ticket' },
      { at: '2026-10-21T20:26:19+02:00', text: 'Ticket #003 held: waiting on Example Agency' },
      { at: '2026-10-21T20:26:19+02:00', text: 'Ticket #004 abandoned: Example Agency dropped it' },
      { at: '2026-10-21T20:26:19+02:00', text: 'Ticket #004 filed: Polish the example footer' },
      { at: '2026-10-21T20:26:10+02:00', text: 'Example milestone reached' },
    ],
    tokensTotal:               1200,
    dispatcherRunId:           null,
    lowPriorityWaitingTickets: [],
  });
});

/**
 * The route clearing low-priority tickets validates against this list, so a held, started or normal-priority ticket
 * must never be in it, and a damaged ticket without an id or title is skipped rather than shown blank.
 */
test('the low-priority waiting tickets are the pending low ones not held, lowest id first, and the run id is read as printed', () => {
  const board = readyBoardOf(minimalDocument({
    concurrency: {
      limit: 2, agentsInFlight: 0, freeSlots: 2, readyTicketIds: [], dispatcherState: 'finished', heldTicketIds: [], dispatcherRunId: 'example-run-7'
    },
    tickets: [
      {
        id: '014', title: 'Example later chore', status: 'pending', priority: 'low'
      },
      {
        id: '009', title: 'Example earlier chore', status: 'pending', priority: 'low'
      },
      {
        id: '010', title: 'Example held chore', status: 'pending', priority: 'low', hold: 'waiting on Example Agency'
      },
      {
        id: '011', title: 'Example started chore', status: 'in-progress', priority: 'low'
      },
      {
        id: '012', title: 'Example normal ticket', status: 'pending', priority: 'normal'
      },
      { id: '013', status: 'pending', priority: 'low' },
      { title: 'Example ticket without an id', status: 'pending', priority: 'low' },
    ],
  }));
  expect(board.lowPriorityWaitingTickets).toEqual([
    { ticketId: '009', title: 'Example earlier chore' },
    { ticketId: '014', title: 'Example later chore' },
  ]);
  expect(board.dispatcherRunId).toBe('example-run-7');
  expect(readyBoardOf(minimalDocument()).dispatcherRunId).toBeNull();
});

test('the recent log is newest stamp first as agent-progress orders it, a backfill below the later stamp, ties by append', () => {
  const board = readyBoardOf(minimalDocument({
    log: [
      { at: '2026-10-21T12:00:00+02:00', text: 'Example appended first' },
      { at: '2026-10-21T10:00:00+02:00', text: 'Example backfilled last' },
      { at: '2026-10-21T12:00:00+02:00', text: 'Example tie appended later' },
      { at: 'not a stamp', text: 'Example unparsable stamp' },
    ],
  }));
  expect(board.recentLog.map((line) => line.text))
    .toEqual(['Example tie appended later', 'Example appended first', 'Example backfilled last', 'Example unparsable stamp']);
});

test('a held ticket is neither ready nor awaiting review, only held, as the CLI\'s own Next line reads it', () => {
  const board = readyBoardOf(minimalDocument({
    concurrency: {
      limit: 2, agentsInFlight: 0, freeSlots: 2, dispatcherState: 'stopped', readyTicketIds: ['003', '005'], heldTicketIds: ['003', '011'],
    },
    reviewWaitingTickets: [{ id: '011' }, { id: '012' }],
  }));
  expect(board.readyTicketIds).toEqual(['005']);
  expect(board.reviewWaitingTicketIds).toEqual(['012']);
  expect(board.heldTicketIds).toEqual(['003', '011']);
});

test('the dispatcher state falls back to the top level when concurrency has none, and an unknown one is unreadable', () => {
  const concurrencyWithoutState = { limit: 1, agentsInFlight: 0, freeSlots: 1 };
  expect(readyBoardOf({ concurrency: concurrencyWithoutState, dispatcherState: 'running' }).dispatcherState).toBe('running');
  expect(boardSummaryOf({ concurrency: { ...concurrencyWithoutState, dispatcherState: 'paused' } }).kind).toBe('unreadable');
});

test('a stored type or a status outside the union changes no count', () => {
  const board = readyBoardOf(minimalDocument({
    tickets: [
      {
        id: '001', title: 'Example', type: 'change', status: 'delivered'
      },
      {
        id: '002', title: 'Example', type: 'feature', status: 'pending'
      },
      { id: '003', title: 'Example', status: 'archived' },
      { id: '004', title: 'Example' },
      'not a ticket',
    ],
  }));
  expect(board.ticketCountByStatus).toEqual({
    'pending': 1, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 1, 'abandoned': 0
  });
  expect(board.ticketTotal).toBe(2);
});

test('active rows are the in-progress ones, oldest start first, a row without a start last, damaged rows skipped', () => {
  const board = readyBoardOf(minimalDocument({
    tickets: [{ id: '007', title: 'Example ticket title', status: 'in-progress' }],
    tasks:   [
      {
        id: 3, name: 'Example unstarted', status: 'in-progress', start: null, owner: 'opus', note: '', ticket: null
      },
      {
        id: 2, name: '#007 Example row name', status: 'in-progress', start: '2026-10-21T10:00:00+02:00', ticket: '007'
      },
      {
        id: 1, name: 'Example earlier, other offset', status: 'in-progress', start: '2026-10-21T07:30:00Z', ticket: null
      },
      {
        id: 4, name: 'Example finished', status: 'delivered', start: '2026-10-21T06:00:00+02:00'
      },
      { name: 'Example without id', status: 'in-progress' },
      {
        id: 5, name: 'Review 2 #009 — Example', status: 'in-progress', start: '2026-10-21T11:00:00+02:00', reviewOf: '009', reviewBarRound: 2
      },
    ],
  }));
  expect(board.activeRows.map((row) => [row.rowId, row.kind, row.ticketId, row.reviewRound, row.title, row.owner])).toEqual([
    [1, 'task', null, null, 'Example earlier, other offset', ''],
    [2, 'build', '007', null, 'Example ticket title', ''],
    [5, 'review', '009', 2, 'Review 2 #009 — Example', ''],
    [3, 'task', null, null, 'Example unstarted', 'opus'],
  ]);
});

test('queue ids, paused builds, the log cap and the token total come from the CLI document as printed', () => {
  const board = readyBoardOf(minimalDocument({
    concurrency: {
      limit: 3, agentsInFlight: 1, freeSlots: 2, dispatcherState: 'running', readyTicketIds: ['003', 4, '005'], heldTicketIds: ['006'],
    },
    reviewWaitingTickets: [{ id: '011', model: 'opus' }, { model: 'opus' }],
    pausedBuilds:         [{ id: '012' }, { id: '013' }],
    log:                  Array.from({ length: 8 }, (_unused, index) => ({ at: `2026-10-21T10:0${index}:00+02:00`, text: `Example ${index}` })),
    tokensByOwner:        { owners: [{ owner: 'opus', tokens: 1000 }, { owner: 'Alex Example', tokens: 'many' }], withoutOwner: { tokens: 250 } },
  }));
  expect(board.readyTicketIds).toEqual(['003', '005']);
  expect(board.heldTicketIds).toEqual(['006']);
  expect(board.reviewWaitingTicketIds).toEqual(['011']);
  expect(board.pausedBuildCount).toBe(2);
  expect(board.recentLog.map((line) => line.text)).toEqual(['Example 7', 'Example 6', 'Example 5', 'Example 4', 'Example 3']);
  expect(board.tokensTotal).toBe(1250);
});

test('a document that is no object or lacks the concurrency counts is unreadable, never a throw', () => {
  for (const document of [null, 'text', [], {}, { concurrency: [] }, { concurrency: { limit: 2, agentsInFlight: 0, dispatcherState: 'stopped' } }]) {
    expect(boardSummaryOf(document).kind, JSON.stringify(document)).toBe('unreadable');
  }
});
