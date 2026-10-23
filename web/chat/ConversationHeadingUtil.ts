import type { ChatMessage } from '../../src/shared/DashboardContract.ts';

/** The words `src/services/ProductOwnerBriefMessage.ts` opens its `spar` instruction with, in the brief every session is sent first. */
const SPARRING_BRIEF_MARK = 'This is a sparring session';
const TITLE_CHARACTERS = 80;

function userTextsOf(messages: ChatMessage[]): string[] {
  return messages.filter((message) => message.role === 'user').map((message) => message.text);
}

/**
 * The first line of the user's first message, trimmed to 80 characters; a dashboard-owned session's first user
 * message is the dashboard's brief, so its title starts after it. Null before the user said anything.
 */
function titleOf(messages: ChatMessage[], startsWithBrief: boolean): string | null {
  const [firstUserText] = userTextsOf(messages).slice(startsWithBrief ? 1 : 0);
  const firstLine = firstUserText?.trim().split('\n', 1)[0]?.trim() ?? '';
  if (firstLine === '') return null;
  return firstLine.length > TITLE_CHARACTERS ? `${firstLine.slice(0, TITLE_CHARACTERS - 1)}…` : firstLine;
}

/** A product owner started with `{ "mode": "spar" }`, as its brief says. */
function isSparring(messages: ChatMessage[]): boolean {
  const [briefText] = userTextsOf(messages);
  return briefText?.includes(SPARRING_BRIEF_MARK) ?? false;
}

export const ConversationHeadingUtil = Object.freeze({
  titleOf,
  isSparring,
});
