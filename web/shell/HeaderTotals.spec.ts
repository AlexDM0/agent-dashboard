/**
 * The header adds up the boards' own counts and never recomputes them: queue lengths come from the id lists, slots
 * from each concurrency limit, and a project without a readable board still counts as a project.
 */
import { expect, test }                          from 'bun:test';
import { boardSummaryWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { headerTotalsOf }                        from './HeaderTotals.ts';

test('the totals sum every readable board and count every project', () => {
  const projects = [
    projectSnapshotWith('example-storefront', {
      health: {
        kind:  'ready',
        board: boardSummaryWith({
          agentsInFlight: 2, concurrencyLimit: 2, readyTicketIds: ['043', '045'], reviewWaitingTicketIds: ['040']
        })
      },
    }),
    projectSnapshotWith('invoice-service', {
      health: {
        kind:  'ready',
        board: boardSummaryWith({
          agentsInFlight: 1, concurrencyLimit: 3, readyTicketIds: ['016'], heldTicketIds: ['007']
        })
      },
    }),
    projectSnapshotWith('research-wiki', { health: { kind: 'missing', reason: 'the root no longer exists' } }),
  ];
  expect(headerTotalsOf(projects)).toEqual({
    projectCount: 3, agentsInFlight: 3, slotCount: 5, readyCount: 3, reviewWaitingCount: 1, heldCount: 1
  });
});

test('no projects is all zeroes', () => {
  expect(headerTotalsOf([])).toEqual({
    projectCount: 0, agentsInFlight: 0, slotCount: 0, readyCount: 0, reviewWaitingCount: 0, heldCount: 0
  });
});
