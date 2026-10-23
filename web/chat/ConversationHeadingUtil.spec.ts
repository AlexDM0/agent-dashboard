/**
 * A conversation's heading: its title is the first line of the user's first message, after the dashboard's brief for
 * a dashboard-owned session, trimmed; a product owner's brief says whether it spars.
 */
import { expect, test } from 'bun:test';

import type { ChatMessage }              from '../../src/shared/DashboardContract.ts';
import { FIXTURE_SPARRING_CONVERSATION } from '../testing/ConversationFixtures.ts';
import { ConversationHeadingUtil }       from './ConversationHeadingUtil.ts';

const AT = '2026-10-23T10:00:00.000Z';

test('the title is the first line of the first message after the brief', () => {
  expect(ConversationHeadingUtil.titleOf(FIXTURE_SPARRING_CONVERSATION, true)).toBe('CSV export for invoices');
});

test('without a brief the first user message titles it; a long line is cut, and no user words is no title', () => {
  const longText = 'An example request '.repeat(10);
  const messages: ChatMessage[] = [{ at: AT, role: 'user', text: longText }];
  const title = ConversationHeadingUtil.titleOf(messages, false);
  expect(title?.length).toBe(80);
  expect(title?.endsWith('…')).toBe(true);
  expect(ConversationHeadingUtil.titleOf(messages, true)).toBeNull();
  expect(ConversationHeadingUtil.titleOf([], false)).toBeNull();
});

test('a brief holding the sparring instruction spars; one without it does not', () => {
  expect(ConversationHeadingUtil.isSparring(FIXTURE_SPARRING_CONVERSATION)).toBe(true);
  expect(ConversationHeadingUtil.isSparring([{ at: AT, role: 'user', text: 'File each ticket as soon as the user and you have agreed on it.' }])).toBe(false);
  expect(ConversationHeadingUtil.isSparring([])).toBe(false);
});
