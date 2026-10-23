/**
 * The split under both session lists: running sessions keep their order, ended ones go to the fold newest first by
 * their last activity (the snapshot has no end instant), and an ended session's line says when it started and ended.
 */
import { expect, test } from 'bun:test';

import type { OrchestratorSession } from '../../src/shared/DashboardContract.ts';
import { orchestratorSessionWith }  from '../testing/SnapshotFixtures.ts';
import { EndedSessionSplitUtil }    from './EndedSessionSplitUtil.ts';

function sessionItself(session: OrchestratorSession): OrchestratorSession {
  return session;
}

const LIVE = orchestratorSessionWith({ sessionId: 'live-example', state: 'busy' });
const OLDER_ENDED = orchestratorSessionWith({ sessionId: 'older-ended', state: 'ended', lastAction: { at: '2026-10-21T10:00:00Z', text: 'older' } });
const NEWER_ENDED = orchestratorSessionWith({ sessionId: 'newer-ended', state: 'ended', lastAction: { at: '2026-10-21T11:00:00Z', text: 'newer' } });

function sessionIdsOf(sessions: OrchestratorSession[]): string[] {
  return sessions.map((session) => session.sessionId);
}

test('one live and two ended sessions split into the live one running and the ended ones newest first', () => {
  const { running, ended } = EndedSessionSplitUtil.splitOf([OLDER_ENDED, LIVE, NEWER_ENDED], sessionItself);
  expect(sessionIdsOf(running)).toEqual(['live-example']);
  expect(sessionIdsOf(ended)).toEqual(['newer-ended', 'older-ended']);
});

test('with no ended session the fold has nothing and the running order is kept', () => {
  const idle = orchestratorSessionWith({ sessionId: 'idle-example', state: 'idle' });
  const { running, ended } = EndedSessionSplitUtil.splitOf([LIVE, idle], sessionItself);
  expect(sessionIdsOf(running)).toEqual(['live-example', 'idle-example']);
  expect(ended).toEqual([]);
});

test('a session that ends between snapshots moves from running to ended on the next split', () => {
  const before = EndedSessionSplitUtil.splitOf([LIVE], sessionItself);
  const after = EndedSessionSplitUtil.splitOf([{ ...LIVE, state: 'ended' }], sessionItself);
  expect([before.running.length, before.ended.length]).toEqual([1, 0]);
  expect([after.running.length, after.ended.length]).toEqual([0, 1]);
});

test('an ended session without an action sorts by its start, and one with neither sorts last', () => {
  const startedOnly = orchestratorSessionWith({ sessionId: 'started-only', state: 'ended', startedAt: '2026-10-21T12:00:00Z' });
  const neither = orchestratorSessionWith({ sessionId: 'neither', state: 'ended', startedAt: null });
  const { ended } = EndedSessionSplitUtil.splitOf([neither, OLDER_ENDED, startedOnly], sessionItself);
  expect(sessionIdsOf(ended)).toEqual(['started-only', 'older-ended', 'neither']);
});

test('an ended line names its start, its end bound and its last action, and says ended when it knows none', () => {
  expect(EndedSessionSplitUtil.endedLineOf(NEWER_ENDED)).toMatch(/^started \d\d:\d\d · ended after \d\d:\d\d · newer$/v);
  expect(EndedSessionSplitUtil.endedLineOf(orchestratorSessionWith({ state: 'ended', startedAt: null }))).toBe('ended');
});
