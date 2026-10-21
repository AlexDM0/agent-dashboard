/** The two routes, a round trip of an id needing encoding, and every malformed hash falling back to the overview. */
import { expect, test }                            from 'bun:test';
import { boardHashOf, hashRouteOf, OVERVIEW_HASH } from './HashRoute.ts';

test('the overview hash and an empty hash are the overview', () => {
  expect(hashRouteOf(OVERVIEW_HASH)).toEqual({ kind: 'overview' });
  expect(hashRouteOf('')).toEqual({ kind: 'overview' });
});

test('a board hash round-trips its tracker id', () => {
  expect(hashRouteOf(boardHashOf('5f0c2a9e-7b1d'))).toEqual({ kind: 'board', trackerId: '5f0c2a9e-7b1d' });
  expect(hashRouteOf(boardHashOf('an id/with space'))).toEqual({ kind: 'board', trackerId: 'an id/with space' });
});

test('a board hash without an id or with broken encoding is the overview', () => {
  expect(hashRouteOf('#/projects/')).toEqual({ kind: 'overview' });
  expect(hashRouteOf('#/projects/%E0%A4%A')).toEqual({ kind: 'overview' });
});
