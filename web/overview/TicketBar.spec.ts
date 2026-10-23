/**
 * The stacked bar and its caption: segments in the done-to-waiting order with zero counts dropped, widths as shares
 * of the total, and a caption that always leads with delivered and words the hyphenated statuses. Abandoned tickets
 * are hidden entirely: no segment, no caption word, and left out of the total, so an all-abandoned board reads empty.
 * The legend under the bar is drawn from the segments, so it lists only non-zero parts, each in its own word, and
 * every width is its count's share; `delivered/total` and the idle heading's "all delivered" test share that total.
 */
import { expect, test }                                from 'bun:test';
import { isAllDeliveredWithNothingReady, ticketBarOf } from './TicketBar.ts';

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
  expect(bar).toEqual({ segments: [], caption: 'No tickets yet', deliveredOfTotal: '0/0' });
});

test('the legend lists only the non-zero parts, in their legend words, and each width is its count over the total', () => {
  const bar = ticketBarOf({
    'pending': 5, 'in-progress': 2, 'in-review': 1, 'reviewed': 0, 'delivered': 12, 'abandoned': 0
  }, 20);
  expect(bar.segments.map((segment) => `${segment.count} ${segment.legendWord}`)).toEqual(['12 delivered', '1 in review', '2 building', '5 pending']);
  expect(bar.segments.map((segment) => segment.widthPercent)).toEqual([60, 5, 10, 25]);
  expect(bar.deliveredOfTotal).toBe('12/20');
});

test('delivered over total leaves abandoned tickets out of the total', () => {
  expect(ticketBarOf({
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 4, 'abandoned': 2
  }, 6).deliveredOfTotal).toBe('4/4');
});

test('a board is all delivered with nothing ready only when every live ticket is delivered and none is ready', () => {
  const allDelivered = {
    'pending': 0, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 4, 'abandoned': 1
  };
  expect(isAllDeliveredWithNothingReady(allDelivered, 5, 0)).toBe(true);
  expect(isAllDeliveredWithNothingReady(allDelivered, 5, 1)).toBe(false);
  expect(isAllDeliveredWithNothingReady({ ...allDelivered, pending: 1 }, 6, 0)).toBe(false);
});
