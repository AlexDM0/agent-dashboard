import type { SessionRole } from '../../src/shared/DashboardContract.ts';

/**
 * `opensCrewDrawer`: the board was asked to open its crew drawer on arrival, then drops the request from the hash;
 * `crewDrawerTab`, when the request named one, the tab it opens on.
 */
export type HashRoute =
  | { kind: 'overview' }
  | { kind: 'fleet' }
  | { kind: 'board'; trackerId: string; opensCrewDrawer: boolean; crewDrawerTab?: SessionRole };

const BOARD_PREFIX = '#/projects/';
const CREW_DRAWER_SUFFIX = 'crew';
const CREW_DRAWER_TABS: readonly string[] = ['orchestrator', 'product-owner'] satisfies SessionRole[];

export const OVERVIEW_HASH = '#/';
export const FLEET_HASH = '#/fleet';

function isCrewDrawerTab(value: string | undefined): value is SessionRole {
  return value !== undefined && CREW_DRAWER_TABS.includes(value);
}

/** An unknown or malformed hash is the overview, so a stale link never strands the page. */
export function hashRouteOf(hash: string): HashRoute {
  if (hash === FLEET_HASH || hash.startsWith(`${FLEET_HASH}/`)) {
    return { kind: 'fleet' };
  }
  if (!hash.startsWith(BOARD_PREFIX)) {
    return { kind: 'overview' };
  }
  const [encodedTrackerId = '', pathSuffix, tabSuffix] = hash.slice(BOARD_PREFIX.length).split('/');
  try {
    const trackerId = decodeURIComponent(encodedTrackerId);
    if (trackerId === '') return { kind: 'overview' };
    const opensCrewDrawer = pathSuffix === CREW_DRAWER_SUFFIX;
    return {
      kind: 'board', trackerId, opensCrewDrawer, ...(opensCrewDrawer && isCrewDrawerTab(tabSuffix) ? { crewDrawerTab: tabSuffix } : {})
    };
  } catch {
    return { kind: 'overview' };
  }
}

export function boardHashOf(trackerId: string): string {
  return `${BOARD_PREFIX}${encodeURIComponent(trackerId)}`;
}

/** Without a tab the board opens the drawer on the role whose questions alone wait. */
export function crewDrawerHashOf(trackerId: string, tab?: SessionRole): string {
  const crewDrawerHash = `${boardHashOf(trackerId)}/${CREW_DRAWER_SUFFIX}`;
  return tab === undefined ? crewDrawerHash : `${crewDrawerHash}/${tab}`;
}
