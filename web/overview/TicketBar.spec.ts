/**
 * The stacked bar and its caption: segments in the done-to-waiting order with zero counts dropped, widths as shares
 * of the total, and a caption that always leads with delivered and words the hyphenated statuses.
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
    'pending': 3, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 1
  }, 4).caption)
    .toBe('0 of 4 delivered · 3 pending · 1 abandoned');
});

test('an empty board has no segments and says so', () => {
  const bar = ticketBarOf({
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
  }, 0);
  expect(bar).toEqual({ segments: [], caption: 'No tickets yet' });
});
