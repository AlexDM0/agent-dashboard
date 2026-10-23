/**
 * The Context column's Mentioned section (A6): the ids the user's and the agent's text name, joined with the ids a
 * pending question's context carries, once each and lowest first, each with its status on the project's board.
 */
import { expect, test } from 'bun:test';

import { FIXTURE_CONVERSATION }                                          from '../testing/ConversationFixtures.ts';
import { chatSnapshotWith, EMPTY_QUESTION_CONTEXT, pendingQuestionWith } from '../testing/SnapshotFixtures.ts';
import { ChatContextUtil }                                               from './ChatContextUtil.ts';

const notes = chatSnapshotWith().projects.find((project) => project.project === 'example-notes');
const NOTES_BOARD = notes?.health.kind === 'ready' ? notes.health.board : null;
const QUESTION_NAMING_TICKETS = pendingQuestionWith('request-example', '2026-10-21T10:00:00+02:00', { ...EMPTY_QUESTION_CONTEXT, mentionedTicketIds: ['043', '055'] });

test('the conversation\'s ids and the question\'s context ids are listed once each, lowest first', () => {
  expect(ChatContextUtil.mentionedTicketIdsOf(FIXTURE_CONVERSATION, [QUESTION_NAMING_TICKETS])).toEqual(['043', '055']);
});

test('a tool call\'s text names no ticket, and a longer number is no ticket id', () => {
  const messages = [
    { at: '2026-10-21T10:00:00Z', role: 'tool' as const, text: 'Bash agent-progress ticket show 061 #062' },
    { at: '2026-10-21T10:00:00Z', role: 'assistant' as const, text: 'Commit #1234 is not a ticket; #040 is.' },
  ];
  expect(ChatContextUtil.mentionedTicketIdsOf(messages, [])).toEqual(['040']);
});

test('each mentioned ticket carries its status on the board', () => {
  expect(ChatContextUtil.mentionedTicketsOf(FIXTURE_CONVERSATION, [QUESTION_NAMING_TICKETS], NOTES_BOARD)).toEqual([
    { ticketId: '043', status: 'building' },
    { ticketId: '055', status: 'not-in-flight' },
  ]);
});
