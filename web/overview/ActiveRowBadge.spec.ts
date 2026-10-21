/** Each row kind's badge colour and word, and a review without a round number. */
import { expect, test }      from 'bun:test';
import type { ActiveRow }    from '../../src/shared/DashboardContract.ts';
import { activeRowBadgeOf }  from './ActiveRowBadge.ts';
import { ticketReferenceOf } from './TicketReference.ts';

const row: ActiveRow = {
  rowId: 7, kind: 'build', ticketId: '042', reviewRound: null, title: 'Add the end-to-end harness', owner: 'opus', startedAt: null, note: ''
};

test('a build is Building in the in-progress colour', () => {
  expect(activeRowBadgeOf(row)).toEqual({ state: 'in-progress', label: 'Building' });
});

test('a review names its round in the reviewing colour', () => {
  expect(activeRowBadgeOf({ ...row, kind: 'review', reviewRound: 2 })).toEqual({ state: 'reviewing', label: 'Review 2' });
  expect(activeRowBadgeOf({ ...row, kind: 'review' })).toEqual({ state: 'reviewing', label: 'Review' });
});

test('a plain task is Task in the pending colour', () => {
  expect(activeRowBadgeOf({ ...row, kind: 'task', ticketId: null })).toEqual({ state: 'pending', label: 'Task' });
});

test('a ticket reference gains its mark once', () => {
  expect(ticketReferenceOf('042')).toBe('#042');
  expect(ticketReferenceOf('#042')).toBe('#042');
});
