/**
 * The frame asks for the board with `embedded=dashboard`, so the flag must join whatever query the page URL already
 * carries without dropping it, and land before a hash rather than inside it. The snapshot fixtures the browser probes
 * serve must carry a page URL it accepts, since a relative one throws and blanks the board.
 */
import { expect, test } from 'bun:test';

import { projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { embeddedBoardUrlOf }  from './EmbeddedBoardUrl.ts';

const PAGE_URL = 'http://127.0.0.1:4100/projects/example-project/page/progress.html';

test('a page URL without a query gains embedded=dashboard as its query', () => {
  expect(embeddedBoardUrlOf(PAGE_URL)).toBe(`${PAGE_URL}?embedded=dashboard`);
});

test('a page URL with a query keeps it and adds embedded=dashboard', () => {
  expect(embeddedBoardUrlOf(`${PAGE_URL}?ticket=007`)).toBe(`${PAGE_URL}?ticket=007&embedded=dashboard`);
});

test('a page URL with a hash gains the flag in its query and keeps the hash last', () => {
  expect(embeddedBoardUrlOf(`${PAGE_URL}#ticket-007`)).toBe(`${PAGE_URL}?embedded=dashboard#ticket-007`);
});

test('a fixture project page URL is absolute, so the frame embeds it without throwing', () => {
  const { pageUrl } = projectSnapshotWith('example-project');
  expect(embeddedBoardUrlOf(pageUrl)).toBe(`${pageUrl}?embedded=dashboard`);
});

test('a page URL already embedded carries the flag once', () => {
  expect(embeddedBoardUrlOf(`${PAGE_URL}?embedded=dashboard`)).toBe(`${PAGE_URL}?embedded=dashboard`);
});
