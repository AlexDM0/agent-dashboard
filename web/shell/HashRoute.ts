/** `opensCrewDrawer`: the board was asked to open its crew drawer on arrival, then drops the request from the hash. */
export type HashRoute = { kind: 'overview' } | { kind: 'fleet' } | { kind: 'board'; trackerId: string; opensCrewDrawer: boolean };

const BOARD_PREFIX = '#/projects/';
const CREW_DRAWER_SUFFIX = 'crew';

export const OVERVIEW_HASH = '#/';
export const FLEET_HASH = '#/fleet';

/** An unknown or malformed hash is the overview, so a stale link never strands the page. */
export function hashRouteOf(hash: string): HashRoute {
  if (hash === FLEET_HASH || hash.startsWith(`${FLEET_HASH}/`)) {
    return { kind: 'fleet' };
  }
  if (!hash.startsWith(BOARD_PREFIX)) {
    return { kind: 'overview' };
  }
  const [encodedTrackerId = '', pathSuffix] = hash.slice(BOARD_PREFIX.length).split('/', 2);
  try {
    const trackerId = decodeURIComponent(encodedTrackerId);
    return trackerId === '' ? { kind: 'overview' } : { kind: 'board', trackerId, opensCrewDrawer: pathSuffix === CREW_DRAWER_SUFFIX };
  } catch {
    return { kind: 'overview' };
  }
}

export function boardHashOf(trackerId: string): string {
  return `${BOARD_PREFIX}${encodeURIComponent(trackerId)}`;
}

export function crewDrawerHashOf(trackerId: string): string {
  return `${boardHashOf(trackerId)}/${CREW_DRAWER_SUFFIX}`;
}
