/**
 * The stacked bar and its caption: segments in the done-to-waiting order with zero counts dropped, widths as shares
 * of the total, and a caption that always leads with delivered and words the hyphenated statuses. Abandoned tickets
 * are hidden entirely: no segment, no caption word, and left out of the total, so an all-abandoned board reads empty.
 */
import { expect, test } from 'bun:test';
import { ticketBarOf }  from './TicketBar.ts';

test('segments follow the done-to-waiting order and skip empty statuses', () => {
  const bar = ticketBarOf({
    'pending': 37, 'in-progress': 1, 'in-review': 2, 'reviewed': 0, 'delivered': 16, 'abandoned': 0
  }, 56);
  expect(bar.segments.map((segment) => segment.status)).toEqual(['delivered', 'in-review', 'in-progress', 'pending']);
  expect(bar.segments[0]?.widthPercent).toBeCloseTo(28.57, 2);
  expect(bar.caption).toBe('16 of 56 delivered · 2 in review · 1 in progress · 37 pending');
});

test('delivered leads the caption even at zero', () => {
  expect(ticketBarOf({
    'pending': 3, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  }, 3).caption)
    .toBe('0 of 3 delivered · 3 pending');
});

test('abandoned tickets leave no segment, no caption word and no share of the total', () => {
  const bar = ticketBarOf({
    'pending': 2, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 1, 'abandoned': 1
  }, 4);
  expect(bar.segments.map((segment) => segment.status)).toEqual(['delivered', 'pending']);
  expect(bar.segments[0]?.widthPercent).toBeCloseTo(33.33, 2);
  expect(bar.caption).toBe('1 of 3 delivered · 2 pending');
  expect(bar.caption).not.toContain('abandoned');
});

test('a board of only abandoned tickets reads as an empty board', () => {
  const onlyAbandoned = ticketBarOf({
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 5
  }, 5);
  const empty = ticketBarOf({
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  }, 0);
  expect(onlyAbandoned).toEqual(empty);
});

test('an empty board has no segments and says so', () => {
  const bar = ticketBarOf({
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  }, 0);
  expect(bar).toEqual({ segments: [], caption: 'No tickets yet' });
});
