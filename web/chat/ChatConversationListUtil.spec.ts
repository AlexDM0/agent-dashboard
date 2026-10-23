/**
 * The overlay's list order (A2): live sessions owing a question first, then live ones by `lastAction.at` newest first
 * (none last), then the ended ones; a watched desktop orchestrator is listed send-only; each line says what matters.
 * The header's Chat button (#066 A2): its live count, and the session it opens on.
 */
import { expect, test } from 'bun:test';

import { chatSnapshotWith, orchestratorSessionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { type ChatConversation, ChatConversationListUtil }                from './ChatConversationListUtil.ts';

function conversationsOfChatSnapshot(): ChatConversation[] {
  const snapshot = chatSnapshotWith();
  return ChatConversationListUtil.conversationsOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker);
}

test('questions first, then live sessions newest action first with none last, then ended ones', () => {
  expect(conversationsOfChatSnapshot().map((conversation) => conversation.key)).toEqual([
    'orchestrator:tracker-example-invoice-service-with-a-long-name',
    'product-owner:tracker-example-storefront',
    'orchestrator:tracker-example-storefront',
    'orchestrator:tracker-example-agency-site',
    'product-owner:tracker-example-agency-site',
    'watched:tracker-example-mobile-app:watched-example',
    'product-owner:tracker-example-notes',
  ]);
});

test('an ended session sorts after a live one even with a newer action, and a question beats a newer action', () => {
  const projects = [
    projectSnapshotWith('example-old', { orchestrator: orchestratorSessionWith({ lastAction: { at: '2026-10-21T08:00:00Z', text: 'older' } }) }),
    projectSnapshotWith('example-ended', { orchestrator: orchestratorSessionWith({ state: 'ended', lastAction: { at: '2026-10-21T12:00:00Z', text: 'newest' } }) }),
    projectSnapshotWith('example-new', { orchestrator: orchestratorSessionWith({ lastAction: { at: '2026-10-21T11:00:00Z', text: 'newer' } }) }),
  ];
  expect(ChatConversationListUtil.conversationsOf(projects, {}).map((conversation) => conversation.projectName)).toEqual(['example-new', 'example-old', 'example-ended']);
});

test('a watched session is send-only, an ended one names its last action, an asking one says a question waits', () => {
  const statusByKey = Object.fromEntries(conversationsOfChatSnapshot().map((conversation) => {
    const line = { status: ChatConversationListUtil.statusLineOf(conversation), isSendOnly: conversation.isSendOnly };
    return [conversation.key, line];
  }));
  expect(statusByKey['watched:tracker-example-mobile-app:watched-example']).toEqual({ status: 'desktop · send-only', isSendOnly: true });
  expect(statusByKey['product-owner:tracker-example-notes']).toEqual({ status: 'ended · Filed #131 and #134', isSendOnly: false });
  expect(statusByKey['product-owner:tracker-example-storefront']).toEqual({ status: 'question waiting', isSendOnly: false });
  expect(statusByKey['product-owner:tracker-example-agency-site']).toEqual({ status: 'Filed #061', isSendOnly: false });
});

test('the Chat button counts the live sessions, the ended one not counted', () => {
  expect(ChatConversationListUtil.liveCountOf(conversationsOfChatSnapshot())).toBe(6);
});

test('the Chat button opens on the session waiting longest, ahead of the last one opened', () => {
  expect(ChatConversationListUtil.openingKeyOf(conversationsOfChatSnapshot(), 'orchestrator:tracker-example-agency-site')).toBe('product-owner:tracker-example-storefront');
});

test('with no question waiting the Chat button reopens the last session opened, else the list\'s first', () => {
  const projects = [
    projectSnapshotWith('example-old', { orchestrator: orchestratorSessionWith({ lastAction: { at: '2026-10-21T08:00:00Z', text: 'older' } }) }),
    projectSnapshotWith('example-new', { orchestrator: orchestratorSessionWith({ lastAction: { at: '2026-10-21T11:00:00Z', text: 'newer' } }) }),
  ];
  const conversations = ChatConversationListUtil.conversationsOf(projects, {});
  expect(ChatConversationListUtil.openingKeyOf(conversations, 'orchestrator:tracker-example-old')).toBe('orchestrator:tracker-example-old');
  expect(ChatConversationListUtil.openingKeyOf(conversations, 'orchestrator:tracker-gone')).toBe('orchestrator:tracker-example-new');
  expect(ChatConversationListUtil.openingKeyOf([], null)).toBeNull();
});

test('a crew drawer tab maps to its dashboard session, else to the project\'s watched orchestrator', () => {
  const conversations = conversationsOfChatSnapshot();
  expect(ChatConversationListUtil.crewSessionKeyOf(conversations, 'tracker-example-notes', 'product-owner')).toBe('product-owner:tracker-example-notes');
  expect(ChatConversationListUtil.crewSessionKeyOf(conversations, 'tracker-example-mobile-app', 'orchestrator')).toBe('watched:tracker-example-mobile-app:watched-example');
  expect(ChatConversationListUtil.crewSessionKeyOf(conversations, 'tracker-example-mobile-app', 'product-owner')).toBeNull();
});
