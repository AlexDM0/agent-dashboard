import type { OrchestratorSession } from '../../src/shared/DashboardContract.ts';
import { TimeUtil }                 from '../time/TimeUtil.ts';

/** A list of sessions parted into the ones still running and the ended ones, the ended newest first. */
export interface EndedSessionSplit<Item> {
  running: Item[];
  ended:   Item[];
}

function instantOf(stamp: string | null | undefined): number {
  const time = stamp === null || stamp === undefined ? Number.NaN : Date.parse(stamp);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/** The snapshot carries no end instant, so an ended session last acted when it ended, else when it started. */
function lastActiveInstantOf(session: OrchestratorSession): number {
  const lastActionInstant = instantOf(session.lastAction?.at);
  return lastActionInstant === Number.NEGATIVE_INFINITY ? instantOf(session.startedAt) : lastActionInstant;
}

/** The running items in their given order, and the ended ones newest first (by last activity, none last). */
function splitOf<Item>(items: Item[], sessionOf: (item: Item) => OrchestratorSession): EndedSessionSplit<Item> {
  const running = items.filter((item) => sessionOf(item).state !== 'ended');
  const ended = items
    .filter((item) => sessionOf(item).state === 'ended')
    .toSorted((a, b) => {
      const instantA = lastActiveInstantOf(sessionOf(a));
      const instantB = lastActiveInstantOf(sessionOf(b));
      if (instantA === instantB) return 0;
      return instantA > instantB ? -1 : 1;
    });
  return { running, ended };
}

/** An ended session's one line under its name: when it started, when it last acted, and that last action. */
function endedLineOf(session: OrchestratorSession): string {
  const parts = [
    session.startedAt === null ? null : `started ${TimeUtil.clockOfStamp(session.startedAt)}`,
    session.lastAction === null ? null : `ended after ${TimeUtil.clockOfStamp(session.lastAction.at)}`,
    session.lastAction?.text ?? null,
  ];
  return parts.filter((part) => part !== null).join(' · ') || 'ended';
}

export const EndedSessionSplitUtil = Object.freeze({
  splitOf,
  endedLineOf,
});
