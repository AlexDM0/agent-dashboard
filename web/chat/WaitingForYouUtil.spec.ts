/**
 * The chat window's Waiting for you section (A1, A2): its badge is the old inbox count, questions plus alerts, the
 * count `document.title` carries; its rows keep the inbox's order; a session's badge counts its question and its alert
 * together; the window opens on the first waiting entry, docking an alert when that entry is one; and with both roles
 * asking, a product owner question still reaches the product owner, where the asking-role fallback would not (#058).
 */
import { expect, test } from 'bun:test';

import { InboxUtil }                     from '../inbox/InboxUtil.ts';
import { OrchestratorSessionUtil }       from '../orchestrator/OrchestratorSessionUtil.ts';
import { crewDrawerHashOf, hashRouteOf } from '../shell/HashRoute.ts';
import {
  inboxSnapshotWith,
  orchestratorSessionWith,
  pendingQuestionWith,
  projectSnapshotWith
} from '../testing/SnapshotFixtures.ts';
import { ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { WaitingForYouUtil }        from './WaitingForYouUtil.ts';

test('the Chat badge counts every question and every alert, the count the document title carries', () => {
  const { projects } = inboxSnapshotWith();
  const inboxCount = InboxUtil.entriesOf(projects).length + InboxUtil.alertsOf(projects).length;
  expect(inboxCount).toBe(4);
  expect(WaitingForYouUtil.waitingCountOf(projects)).toBe(inboxCount);
  expect(InboxUtil.documentTitleOf(WaitingForYouUtil.waitingCountOf(projects), 'agent-dashboard')).toBe('(4) agent-dashboard');
  expect(WaitingForYouUtil.waitingCountOf([])).toBe(0);
});

test('the rows keep the inbox order: the alerts in project order, then the questions the longest waiting first', () => {
  const items = WaitingForYouUtil.waitingItemsOf(inboxSnapshotWith().projects);
  expect(items.map((item) => item.key)).toEqual([
    'alert:tracker-example-storefront',
    'alert:tracker-example-agency-site',
    'question:tracker-example-storefront:request-context',
    'question:tracker-example-notes:request-bare',
  ]);
  expect(items.map((item) => item.conversationKey)).toContain('orchestrator:tracker-example-agency-site');
});

test('a session\'s badge counts its questions and its alert together', () => {
  const counts = WaitingForYouUtil.waitingCountByConversationKeyOf(WaitingForYouUtil.waitingItemsOf(inboxSnapshotWith().projects));
  expect(Object.fromEntries(counts)).toEqual({
    'orchestrator:tracker-example-storefront':  2,
    'orchestrator:tracker-example-agency-site': 1,
    'orchestrator:tracker-example-notes':       1,
  });
});

test('the window opens on the first waiting entry with its card docked, else on the session the conversation rule picks', () => {
  const snapshot = inboxSnapshotWith();
  const items = WaitingForYouUtil.waitingItemsOf(snapshot.projects);
  const conversations = ChatConversationListUtil.conversationsOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker);
  expect(WaitingForYouUtil.openingOf(items, conversations, null)).toEqual({ key: 'orchestrator:tracker-example-storefront', docked: { kind: 'alert' } });
  const lastOpenedKey = 'orchestrator:tracker-example-notes';
  const ruleKey = ChatConversationListUtil.openingKeyOf(conversations, lastOpenedKey);
  expect(WaitingForYouUtil.openingOf([], conversations, lastOpenedKey)).toEqual({ key: ruleKey, docked: null });
});

test('with both roles asking, each question selects its own role\'s session and collapses to that role\'s crew tab', () => {
  const orchestratorQuestion = pendingQuestionWith('request-orchestrator', '2026-10-21T09:50:00+02:00');
  const productOwnerQuestion = pendingQuestionWith('request-product-owner', '2026-10-21T09:55:00+02:00');
  const askingProject = projectSnapshotWith('example-both-asking', {
    orchestrator: orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [orchestratorQuestion] }),
    productOwner: orchestratorSessionWith({ sessionId: 'product-owner-example', state: 'waiting-for-answer', pendingQuestions: [productOwnerQuestion] }),
  });
  expect(OrchestratorSessionUtil.askingRoleOf(askingProject)).toBe('orchestrator');
  const items = WaitingForYouUtil.waitingItemsOf([askingProject]);
  expect(items.map((item) => item.conversationKey)).toEqual(['orchestrator:tracker-example-both-asking', 'product-owner:tracker-example-both-asking']);
  for (const item of items) {
    if (item.kind !== 'question') continue;
    expect(hashRouteOf(crewDrawerHashOf(item.entry.trackerId, item.entry.role))).toStrictEqual({
      kind: 'board', trackerId: 'tracker-example-both-asking', opensCrewDrawer: true, crewDrawerTab: item.entry.role
    });
  }
});

test('the row marked as shown is the one whose session and docked card are selected', () => {
  const items = WaitingForYouUtil.waitingItemsOf(inboxSnapshotWith().projects);
  const storefront = 'orchestrator:tracker-example-storefront';
  expect(WaitingForYouUtil.selectedItemKeyOf(items, storefront, { kind: 'alert' })).toBe('alert:tracker-example-storefront');
  expect(WaitingForYouUtil.selectedItemKeyOf(items, storefront, { kind: 'question', requestId: 'request-context' })).toBe('question:tracker-example-storefront:request-context');
  expect(WaitingForYouUtil.selectedItemKeyOf(items, storefront, null)).toBeNull();
});
