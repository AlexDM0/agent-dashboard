import type { ProjectSnapshot }                            from '../../src/shared/DashboardContract.ts';
import { type InboxAlert, type InboxEntry, InboxUtil }     from '../inbox/InboxUtil.ts';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';

/** What the selected session docks above its composer when it was picked from Waiting for you. */
export type DockedWaiting = { kind: 'question'; requestId: string } | { kind: 'alert' };

/** One row of Waiting for you: a pending question or a critical context, with the session it selects. */
export type WaitingItem =
  | { kind: 'question'; key: string; conversationKey: string; entry: InboxEntry }
  | { kind: 'alert'; key: string; conversationKey: string; alert: InboxAlert };

/** Where the header's Chat button opens: a session, and what it docks. */
export interface ChatOpening {
  key:    string | null;
  docked: DockedWaiting | null;
}

function questionItemOf(entry: InboxEntry): WaitingItem {
  const key = `question:${entry.trackerId}:${entry.pendingQuestion.requestId}`;
  return {
    kind: 'question', key, conversationKey: ChatConversationListUtil.dashboardKeyOf(entry.role, entry.trackerId), entry
  };
}

function alertItemOf(alert: InboxAlert): WaitingItem {
  return {
    kind: 'alert', key: `alert:${alert.trackerId}`, conversationKey: ChatConversationListUtil.dashboardKeyOf('orchestrator', alert.trackerId), alert
  };
}

/** The inbox's order: every critical context in project order, then every question, the longest waiting first. */
function waitingItemsOf(projects: ProjectSnapshot[]): WaitingItem[] {
  return [...InboxUtil.alertsOf(projects).map(alertItemOf), ...InboxUtil.entriesOf(projects).map(questionItemOf)];
}

/** Questions plus alerts: the Chat button's badge and the count `document.title` carries. */
function waitingCountOf(projects: ProjectSnapshot[]): number {
  return waitingItemsOf(projects).length;
}

/** A session's questions and its alert together, keyed by the session's conversation key. */
function waitingCountByConversationKeyOf(items: WaitingItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.conversationKey, (counts.get(item.conversationKey) ?? 0) + 1);
  return counts;
}

function dockedOf(item: WaitingItem): DockedWaiting {
  return item.kind === 'alert' ? { kind: 'alert' } : { kind: 'question', requestId: item.entry.pendingQuestion.requestId };
}

/** The row a session and its docked card stand for, so that row is marked as the one shown. */
function selectedItemKeyOf(items: WaitingItem[], conversationKey: string | null, docked: DockedWaiting | null): string | null {
  if (conversationKey === null || docked === null) return null;
  const item = items.find((candidate) => candidate.conversationKey === conversationKey
    && (docked.kind === 'alert' ? candidate.kind === 'alert' : candidate.kind === 'question' && candidate.entry.pendingQuestion.requestId === docked.requestId));
  return item?.key ?? null;
}

/** The oldest waiting entry when there is one, else the session #066's rule picks. */
function openingOf(items: WaitingItem[], conversations: ChatConversation[], lastOpenedKey: string | null): ChatOpening {
  const [firstItem] = items;
  if (firstItem !== undefined) return { key: firstItem.conversationKey, docked: dockedOf(firstItem) };
  return { key: ChatConversationListUtil.openingKeyOf(conversations, lastOpenedKey), docked: null };
}

export const WaitingForYouUtil = Object.freeze({
  waitingItemsOf,
  waitingCountOf,
  waitingCountByConversationKeyOf,
  dockedOf,
  selectedItemKeyOf,
  openingOf,
});
