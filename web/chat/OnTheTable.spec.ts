/**
 * On the table read as static markup (A4, A6): a fixture table shows its points grouped by state, its draft and its
 * references with their board status; a malformed or absent table says "Nothing on the table yet"; the conversation
 * beside it shows an agent's `<img onerror>` as escaped text, its table block taken out.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConversationLog }               from '../orchestrator/ConversationLog.tsx';
import { FIXTURE_SPARRING_CONVERSATION } from '../testing/ConversationFixtures.ts';
import { chatSnapshotWith }              from '../testing/SnapshotFixtures.ts';
import { OnTheTable }                    from './OnTheTable.tsx';
import { SparTableUtil }                 from './SparTableUtil.ts';

const notes = chatSnapshotWith().projects.find((project) => project.project === 'example-notes');
const NOTES_BOARD = notes?.health.kind === 'ready' ? notes.health.board : null;

function markupOfTableIn(text: string): string {
  return renderToStaticMarkup(createElement(OnTheTable, { table: SparTableUtil.tableOfText(text), board: NOTES_BOARD }));
}

test('a fixture table shows each point under its state, its draft and its references with their status', () => {
  const markup = renderToStaticMarkup(createElement(OnTheTable, { table: SparTableUtil.latestTableOf(FIXTURE_SPARRING_CONVERSATION), board: NOTES_BOARD }));
  expect(markup).toMatch(/aria-label="Agreed points".*Export the invoice lines to CSV/u);
  expect(markup).toMatch(/aria-label="Open points".*Which columns the totals row keeps/u);
  expect(markup).toMatch(/aria-label="Parked points".*A PDF export/u);
  expect(markup).toContain('Export invoice line items to CSV');
  expect(markup).toMatch(/#043<\/span><span class="ap-pill" data-state="in-progress">building/u);
  expect(markup).toMatch(/#040<\/span><span class="ap-pill" data-state="in-review">in review/u);
  expect(markup).toMatch(/#047<\/span><span class="ap-pill" data-state="paused">held/u);
  expect(markup).toContain('title="Dispatcher">running</span>');
  expect(markup).not.toContain('Nothing on the table yet');
});

test('a malformed or absent table reads "Nothing on the table yet"', () => {
  expect(markupOfTableIn('```spar-table\n{"points":\n```')).toContain('Nothing on the table yet');
  expect(markupOfTableIn('No table here')).toContain('Nothing on the table yet');
});

test('the conversation shows an agent\'s img markup as text and none of its table block', () => {
  const markup = renderToStaticMarkup(createElement(ConversationLog, { role: 'product-owner', messages: SparTableUtil.messagesWithoutTablesOf(FIXTURE_SPARRING_CONVERSATION) }));
  expect(markup).not.toContain('<img');
  expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(markup).not.toContain('spar-table');
});
