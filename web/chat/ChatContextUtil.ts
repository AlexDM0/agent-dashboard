import type { BoardSummary, ChatMessage, PendingQuestion } from '../../src/shared/DashboardContract.ts';
import { type ReferencedTicketStatus, SparTableUtil }      from './SparTableUtil.ts';

export interface MentionedTicket { ticketId: string; status: ReferencedTicketStatus }

const TICKET_MENTION_PATTERN = /#(\d{3})(?!\d)/gu;

/** Every `#<id>` the user's and the agent's text names (tool calls left out) and every id its pending questions' context carries, lowest first. */
function mentionedTicketIdsOf(messages: ChatMessage[], pendingQuestions: PendingQuestion[]): string[] {
  const spokenMessages = messages.filter((message) => message.role === 'user' || message.role === 'assistant');
  const fromMessages = spokenMessages.flatMap((message) => [...message.text.matchAll(TICKET_MENTION_PATTERN)].map((match) => match[1] ?? ''));
  const fromQuestions = pendingQuestions.flatMap((pendingQuestion) => pendingQuestion.context.mentionedTicketIds);
  return [...new Set([...fromMessages, ...fromQuestions])].filter((ticketId) => ticketId !== '').toSorted();
}

function mentionedTicketsOf(messages: ChatMessage[], pendingQuestions: PendingQuestion[], board: BoardSummary | null): MentionedTicket[] {
  return mentionedTicketIdsOf(messages, pendingQuestions).map((ticketId) => ({ ticketId, status: SparTableUtil.referencedTicketStatusOf(board, ticketId) }));
}

export const ChatContextUtil = Object.freeze({
  mentionedTicketIdsOf,
  mentionedTicketsOf,
});
