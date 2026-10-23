/**
 * The chat window's left column (A1): live sessions grouped under their project in the rail's order (active, then
 * idle, each alphabetical), an idle project with no live session left out, only crew sessions listed (no in-flight
 * agent), "+ Product owner" offered where none lives, the ended sessions apart; and the search and the filter.
 */
import { expect, test } from 'bun:test';

import { chatSnapshotWith }                           from '../testing/SnapshotFixtures.ts';
import { ChatConversationListUtil }                   from './ChatConversationListUtil.ts';
import { type ChatWindowGroups, ChatWindowGroupUtil } from './ChatWindowGroupUtil.ts';

function groupsOfChatSnapshot(): ChatWindowGroups {
  const snapshot = chatSnapshotWith();
  return ChatWindowGroupUtil.groupsOf(snapshot.projects, ChatConversationListUtil.conversationsOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker));
}

function outlineOf(groups: ChatWindowGroups): Record<string, string[]> {
  return Object.fromEntries(groups.projectGroups.map((group) => [group.project.project, group.conversations.map((conversation) => conversation.key)]));
}

test('live sessions sit under their project in the rail\'s order, and an idle project with none is left out', () => {
  const groups = groupsOfChatSnapshot();
  expect(groups.projectGroups.map((group) => group.project.project)).toEqual([
    'example-agency-site', 'example-invoice-service-with-a-long-name', 'example-mobile-app', 'example-notes', 'example-storefront',
  ]);
  expect(outlineOf(groups)['example-storefront']).toEqual(['product-owner:tracker-example-storefront', 'orchestrator:tracker-example-storefront']);
  expect(outlineOf(groups)['example-mobile-app']).toEqual(['watched:tracker-example-mobile-app:watched-example']);
});

test('each project carries its crew sessions only, never its in-flight agents, and offers a product owner only where none lives', () => {
  const groupByName = Object.fromEntries(groupsOfChatSnapshot().projectGroups.map((group) => [group.project.project, group]));
  expect(Object.keys(groupByName['example-notes'] ?? {}).toSorted()).toEqual(['conversations', 'offersProductOwner', 'project']);
  expect(groupByName['example-notes']?.offersProductOwner).toBe(true);
  expect(groupByName['example-storefront']?.offersProductOwner).toBe(false);
  expect(groupByName['example-mobile-app']?.offersProductOwner).toBe(true);
});

test('an ended session leaves its project and sits under the ended ones', () => {
  const groups = groupsOfChatSnapshot();
  expect(groups.endedConversations.map((conversation) => conversation.key)).toEqual(['product-owner:tracker-example-notes']);
  expect(outlineOf(groups)['example-notes']).toEqual([]);
});

test('"Waiting for you" keeps only the sessions owing an answer and drops the projects left empty', () => {
  const filtered = ChatWindowGroupUtil.filteredOf(groupsOfChatSnapshot(), '', 'waiting');
  expect(outlineOf(filtered)).toEqual({
    'example-invoice-service-with-a-long-name': ['orchestrator:tracker-example-invoice-service-with-a-long-name'],
    'example-storefront':                       ['product-owner:tracker-example-storefront'],
  });
  expect(filtered.endedConversations).toEqual([]);
});

test('the search matches a role across projects, or a project name with all its sessions', () => {
  const byRole = ChatWindowGroupUtil.filteredOf(groupsOfChatSnapshot(), 'Product', 'all');
  expect(Object.values(outlineOf(byRole)).flat()).toEqual(['product-owner:tracker-example-agency-site', 'product-owner:tracker-example-storefront']);
  expect(byRole.endedConversations.map((conversation) => conversation.key)).toEqual(['product-owner:tracker-example-notes']);
  const byProject = ChatWindowGroupUtil.filteredOf(groupsOfChatSnapshot(), 'storefront', 'all');
  expect(outlineOf(byProject)).toEqual({ 'example-storefront': ['product-owner:tracker-example-storefront', 'orchestrator:tracker-example-storefront'] });
});
