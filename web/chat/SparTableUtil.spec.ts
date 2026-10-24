/**
 * The table read from a `spar-table` fence (A4): a valid block in #043's shape is read whole; a block with any wrong
 * entry, malformed JSON or none at all reads as no table, so the newest good one stays; the fences leave the chat
 * text; a referenced ticket takes its status from the snapshot's board.
 */
import { expect, test } from 'bun:test';

import type { ChatMessage }                                  from '../../src/shared/DashboardContract.ts';
import { FIXTURE_SPAR_TABLE, FIXTURE_SPARRING_CONVERSATION } from '../testing/ConversationFixtures.ts';
import { boardSummaryWith, chatSnapshotWith }                from '../testing/SnapshotFixtures.ts';
import { SparTableUtil }                                     from './SparTableUtil.ts';

function fenced(json: string): string {
  return `Some reply.\n\n\`\`\`spar-table\n${json}\n\`\`\``;
}

test('a valid block reads as its whole table', () => {
  expect(SparTableUtil.tableOfText(fenced(JSON.stringify(FIXTURE_SPAR_TABLE)))).toEqual(FIXTURE_SPAR_TABLE as never);
});

test('a reply that follows the spar brief\'s instruction, ending in its example block filled in, reads as a non-empty table', () => {
  const reply = 'CSV export is agreed; PDF is parked for now.\n\n```spar-table\n'
    + '{"points":[{"id":"p1","text":"Export line items to CSV.","state":"agreed"},{"id":"p2","text":"PDF export.","state":"parked"}],'
    + '"draftTickets":[{"key":"d1","title":"Export invoice line items to CSV","type":"ticket","summary":"A CSV download of the invoice page."}],'
    + '"referencedTicketIds":["042"]}\n```';
  const table = SparTableUtil.tableOfText(reply);
  expect(table?.points.map((point) => point.state)).toEqual(['agreed', 'parked']);
  expect(table?.draftTickets.map((draft) => draft.key)).toEqual(['d1']);
  expect(table?.referencedTicketIds).toEqual(['042']);
});

test('malformed JSON, a missing array, a state or type outside its union, or a bad ticket id rejects the block', () => {
  const malformedBlocks = [
    '{"points":[',
    '{"points":[],"draftTickets":[]}',
    '{"points":[{"id":"p1","text":"x","state":"done"}],"draftTickets":[],"referencedTicketIds":[]}',
    '{"points":[],"draftTickets":[{"key":"d1","title":"x","type":"epic","summary":"y"}],"referencedTicketIds":[]}',
    '{"points":[],"draftTickets":[],"referencedTicketIds":["42"]}',
    '[]',
  ];
  expect(malformedBlocks.map((json) => SparTableUtil.tableOfText(fenced(json)))).toEqual(malformedBlocks.map(() => null));
  expect(SparTableUtil.tableOfText('No block here')).toBeNull();
});

test('a broken newer block keeps the last good table, and a conversation without one has none', () => {
  expect(SparTableUtil.latestTableOf(FIXTURE_SPARRING_CONVERSATION)).toEqual(FIXTURE_SPAR_TABLE as never);
  expect(SparTableUtil.latestTableOf(FIXTURE_SPARRING_CONVERSATION.slice(0, 2))).toBeNull();
});

test('the chat shows the replies without their blocks, and a reply that was only a block is left out', () => {
  const onlyBlock: ChatMessage = { at: '2026-10-23T10:00:00.000Z', role: 'assistant', text: fenced('{}').replace('Some reply.\n\n', '') };
  const shown = SparTableUtil.messagesWithoutTablesOf([...FIXTURE_SPARRING_CONVERSATION, onlyBlock]);
  const userTexts = FIXTURE_SPARRING_CONVERSATION.slice(0, 2).map((message) => message.text);
  expect(shown.map((message) => message.text)).toEqual([
    ...userTexts,
    'Agreed on CSV. <img src=x onerror=alert(1)> stays text.',
    'Parking PDF.',
  ]);
});

test('a point group holds only its state', () => {
  const table = SparTableUtil.tableOfText(fenced(JSON.stringify(FIXTURE_SPAR_TABLE)));
  expect(table === null ? [] : SparTableUtil.pointsInStateOf(table, 'parked').map((point) => point.id)).toEqual(['p3']);
});

test('a referenced ticket reads its status from the board, and an unreadable board says so', () => {
  const notes = chatSnapshotWith().projects.find((project) => project.project === 'example-notes');
  const board = notes?.health.kind === 'ready' ? notes.health.board : null;
  expect(['043', '040', '047', '099'].map((ticketId) => SparTableUtil.referencedTicketStatusOf(board, ticketId))).toEqual(['building', 'reviewing', 'held', 'not-in-flight']);
  const waitingBoard = boardSummaryWith({ readyTicketIds: ['001'], reviewWaitingTicketIds: ['002'], lowPriorityWaitingTickets: [{ ticketId: '003', title: 'Example' }] });
  expect(['001', '002', '003'].map((ticketId) => SparTableUtil.referencedTicketStatusOf(waitingBoard, ticketId))).toEqual(['ready', 'review-waiting', 'low-priority-waiting']);
  expect(SparTableUtil.referencedTicketStatusOf(null, '043')).toBe('unknown');
});
