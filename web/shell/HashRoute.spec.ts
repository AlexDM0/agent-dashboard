/** The three routes, a round trip of an id needing encoding, and every malformed hash falling back to the overview. */
import { expect, test } from 'bun:test';
import {
  boardHashOf,
  crewDrawerHashOf,
  FLEET_HASH,
  hashRouteOf,
  OVERVIEW_HASH
} from './HashRoute.ts';

test('the overview hash and an empty hash are the overview', () => {
  expect(hashRouteOf(OVERVIEW_HASH)).toEqual({ kind: 'overview' });
  expect(hashRouteOf('')).toEqual({ kind: 'overview' });
});

test('the fleet hash is the fleet, with or without a trailing slash', () => {
  expect(hashRouteOf(FLEET_HASH)).toEqual({ kind: 'fleet' });
  expect(hashRouteOf(`${FLEET_HASH}/`)).toEqual({ kind: 'fleet' });
});

test('a hash that only starts like the fleet one is the overview', () => {
  expect(hashRouteOf('#/fleetwood')).toEqual({ kind: 'overview' });
});

test('a board hash round-trips its tracker id', () => {
  expect(hashRouteOf(boardHashOf('5f0c2a9e-7b1d'))).toEqual({ kind: 'board', trackerId: '5f0c2a9e-7b1d', opensCrewDrawer: false });
  expect(hashRouteOf(boardHashOf('an id/with space'))).toEqual({ kind: 'board', trackerId: 'an id/with space', opensCrewDrawer: false });
});

test('a crew drawer hash is its board asked to open the drawer; any other suffix opens nothing', () => {
  expect(hashRouteOf(crewDrawerHashOf('an id/with space'))).toEqual({ kind: 'board', trackerId: 'an id/with space', opensCrewDrawer: true });
  expect(hashRouteOf(`${boardHashOf('example')}/other`)).toEqual({ kind: 'board', trackerId: 'example', opensCrewDrawer: false });
});

test('a crew drawer hash naming a role opens the drawer on that tab; an unknown tab names none', () => {
  expect(hashRouteOf(crewDrawerHashOf('example', 'product-owner'))).toStrictEqual({
    kind: 'board', trackerId: 'example', opensCrewDrawer: true, crewDrawerTab: 'product-owner'
  });
  expect(hashRouteOf(`${crewDrawerHashOf('example')}/other`)).toStrictEqual({ kind: 'board', trackerId: 'example', opensCrewDrawer: true });
  expect(hashRouteOf(`${boardHashOf('example')}/other/orchestrator`)).toStrictEqual({ kind: 'board', trackerId: 'example', opensCrewDrawer: false });
});

test('a board hash without an id or with broken encoding is the overview', () => {
  expect(hashRouteOf('#/projects/')).toEqual({ kind: 'overview' });
  expect(hashRouteOf('#/projects/%E0%A4%A')).toEqual({ kind: 'overview' });
});
