export type HashRoute = { kind: 'overview' } | { kind: 'board'; trackerId: string };

const BOARD_PREFIX = '#/projects/';

/** An unknown or malformed hash is the overview, so a stale link never strands the page. */
export function hashRouteOf(hash: string): HashRoute {
  if (!hash.startsWith(BOARD_PREFIX)) {
    return { kind: 'overview' };
  }
  const encodedTrackerId = hash.slice(BOARD_PREFIX.length).split('/', 1)[0] ?? '';
  try {
    const trackerId = decodeURIComponent(encodedTrackerId);
    return trackerId === '' ? { kind: 'overview' } : { kind: 'board', trackerId };
  } catch {
    return { kind: 'overview' };
  }
}

export function boardHashOf(trackerId: string): string {
  return `${BOARD_PREFIX}${encodeURIComponent(trackerId)}`;
}

export const OVERVIEW_HASH = '#/';
