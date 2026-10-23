/**
 * The rendered chat, read as its static markup: a run of three calls is one closed line listing three closed calls,
 * each opening to its result or saying it runs; text turns render as GFM Markdown, links open in a new tab without an
 * opener, and HTML a session writes arrives as escaped text, never as elements.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ChatMessage }     from '../../src/shared/DashboardContract.ts';
import { FIXTURE_CONVERSATION } from '../testing/ConversationFixtures.ts';
import { ConversationLog }      from './ConversationLog.tsx';

function markupOf(messages: ChatMessage[]): string {
  return renderToStaticMarkup(createElement(ConversationLog, { role: 'orchestrator', messages }));
}

function countOf(markup: string, pattern: RegExp): number {
  return [...markup.matchAll(pattern)].length;
}

const [, , ...THREE_CALL_RUN] = FIXTURE_CONVERSATION.slice(0, 6);

test('a run of three calls renders one closed line whose expansion lists three closed calls', () => {
  const markup = markupOf(THREE_CALL_RUN);
  expect(countOf(markup, /<details class="ap-tool-group">/gu)).toBe(1);
  expect(markup).toContain('<summary class="ap-tool-group-summary">Used 3 tools</summary>');
  expect(countOf(markup, /<li class="ap-tool-call" data-progress="[a-z]+"><details>/gu)).toBe(3);
  expect(markup).not.toContain(' open');
  expect([...markup.matchAll(/<span class="ap-tool-name">([^<]*)<\/span>/gu)].map((match) => match[1])).toEqual(['Read', 'Bash', 'Bash']);
});

test('a call opens to its result, or says it is running, and an older-shape call says no result was recorded', () => {
  const markup = markupOf(FIXTURE_CONVERSATION);
  expect(markup).toContain('<pre class="mono ap-tool-text ap-tool-result"># Notes for Alex Example</pre>');
  expect(markup).toMatch(/data-progress="running"><details>.*?<p class="muted ap-tool-status">Running…<\/p>/u);
  expect(markup).toMatch(/data-progress="unrecorded"><details>.*?<p class="muted ap-tool-status">No result recorded<\/p>/u);
  expect(markup).toContain('<summary class="ap-tool-group-summary">Used 1 tool</summary>');
  expect(countOf(markup, /<li class="ap-turn" data-role="assistant">/gu)).toBe(2);
});

test('text turns render a table, a task list, fenced code and a link opening in a new tab', () => {
  const markup = markupOf(FIXTURE_CONVERSATION);
  expect(markup).toContain('<td>#055</td>');
  expect(markup).toContain('<input type="checkbox" disabled="" checked=""/>');
  expect(countOf(markup, /<input type="checkbox"/gu)).toBe(2);
  expect(markup).toContain('<pre><code>agent-progress status --json\n</code></pre>');
  expect(markup).toContain('<a href="https://example.com/board" target="_blank" rel="noopener noreferrer">the board</a>');
});

test('HTML in a message arrives as text, never as elements', () => {
  const markup = markupOf(FIXTURE_CONVERSATION);
  expect(markup).not.toContain('<script');
  expect(markup).not.toContain('<b>');
  expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(markup).toContain('&lt;b&gt;bold&lt;/b&gt;');
});
