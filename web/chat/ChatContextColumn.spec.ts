/**
 * The chat window's Context column (A3, A9, A10): while a question waits its first block is "Why it asks", holding
 * exactly the rows `InboxUtil.contextRowsOf` builds, as text even when the agent's last line carries markup; a question
 * with no context gets no such block; and the project's crew replaces the in-flight agents, with "+ New ticket".
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PendingQuestion }                            from '../../src/shared/DashboardContract.ts';
import { InboxUtil }                                       from '../inbox/InboxUtil.ts';
import { inboxSnapshotWith }                               from '../testing/SnapshotFixtures.ts';
import { ChatContextColumn }                               from './ChatContextColumn.tsx';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';

const NOW = Date.parse('2026-10-21T10:00:00+02:00');

function orchestratorOf(projectName: string): ChatConversation {
  const snapshot = inboxSnapshotWith();
  const conversation = ChatConversationListUtil.conversationsOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker)
    .find((candidate) => candidate.projectName === projectName && candidate.role === 'orchestrator');
  if (conversation === undefined) throw new Error(`no orchestrator in ${projectName}`);
  return conversation;
}

function columnMarkupOf(conversation: ChatConversation, pendingQuestion: PendingQuestion | null): string {
  return renderToStaticMarkup(createElement(ChatContextColumn, {
    conversation,
    board:    null,
    messages: [],
    pendingQuestion,
    crew:     { conversations: [conversation], canStartProductOwner: true },
    now:      NOW,
    onSelect: () => undefined,
    onLeave:  () => undefined,
  }));
}

function sectionLabelsOf(markup: string): string[] {
  return [...markup.matchAll(/<section class="ap-chat-context-section" aria-label="([^"]*)"/gu)].map((match) => match[1] ?? '');
}

test('the first block of a waiting question is Why it asks, with the rows contextRowsOf builds, as text', () => {
  const conversation = orchestratorOf('example-storefront');
  const [pendingQuestion] = conversation.session.pendingQuestions;
  if (pendingQuestion === undefined) throw new Error('the fixture question is missing');
  const markup = columnMarkupOf(conversation, pendingQuestion);
  expect(sectionLabelsOf(markup)[0]).toBe('Why it asks');
  const rowLabels = [...markup.matchAll(/<div class="ap-chat-context-row"><dt class="muted">([^<]*)<\/dt>/gu)].map((match) => match[1]);
  expect(rowLabels).toEqual(['Doing', 'Mentions', 'Said']);
  expect(InboxUtil.contextRowsOf(pendingQuestion.context).map((row) => row.kind)).toEqual(['doing', 'mentions', 'said']);
  expect(markup).toContain('dispatcher run run-0123');
  expect(markup).toContain('#041');
  expect(markup).toContain('#133');
  expect(markup).not.toContain('<img');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

test('a question whose context is empty, or no question, opens the column on Session', () => {
  const conversation = orchestratorOf('example-notes');
  const [bareQuestion] = conversation.session.pendingQuestions;
  if (bareQuestion === undefined) throw new Error('the fixture question is missing');
  expect(sectionLabelsOf(columnMarkupOf(conversation, bareQuestion))[0]).toBe('Session');
  expect(sectionLabelsOf(columnMarkupOf(conversation, null))[0]).toBe('Session');
});

test('the crew of the project replaces the in-flight agents, with + New ticket', () => {
  const markup = columnMarkupOf(orchestratorOf('example-notes'), null);
  expect(sectionLabelsOf(markup)).toContain('Crew of example-notes');
  expect(markup).not.toContain('Also in');
  expect(markup).toContain('+ New ticket');
  expect(markup).toContain('Orchestrator');
});
