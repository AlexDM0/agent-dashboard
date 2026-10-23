/**
 * What the panel, the cards and the rail say about a project's sessions: the dashboard-owned one first, a name for
 * every session (a watched one without a record name by its short id), the state words and colours, and when a
 * question waits or a Start is offered; an ended session neither waits nor blocks a new start.
 */
import { expect, test }                                 from 'bun:test';
import { orchestratorSessionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { OrchestratorSessionUtil }                      from './OrchestratorSessionUtil.ts';

const PENDING_QUESTION = {
  requestId: 'request-example', askedAt: '2026-10-21T10:00:00+02:00', questions: [], context: { dispatcherRunId: null, mentionedTicketIds: [], lastAssistantLine: null }
};

test('the dashboard-owned session comes before the watched ones', () => {
  const owned = orchestratorSessionWith({ sessionId: 'owned' });
  const watched = orchestratorSessionWith({ ownership: 'watched', sessionId: 'watched' });
  const sessions = OrchestratorSessionUtil.sessionsOf(projectSnapshotWith('example', { orchestrator: owned }), [watched]);
  expect(sessions.map((session) => session.sessionId)).toEqual(['owned', 'watched']);
  expect(OrchestratorSessionUtil.sessionsOf(projectSnapshotWith('example'), [watched])).toEqual([watched]);
});

test('watched sessions are looked up by tracker id as an own key only', () => {
  const watched = orchestratorSessionWith({ ownership: 'watched' });
  expect(OrchestratorSessionUtil.watchedSessionsOf({ 'tracker-example': [watched] }, 'tracker-example')).toEqual([watched]);
  expect(OrchestratorSessionUtil.watchedSessionsOf({}, 'toString')).toEqual([]);
});

test('a dashboard-owned session has a fixed name, a watched one its record name or its short id', () => {
  expect(OrchestratorSessionUtil.nameOf(orchestratorSessionWith())).toBe('Dashboard orchestrator');
  expect(OrchestratorSessionUtil.nameOf(orchestratorSessionWith({ ownership: 'watched', name: 'Example session' }))).toBe('Example session');
  expect(OrchestratorSessionUtil.nameOf(orchestratorSessionWith({ ownership: 'watched', sessionId: '0123456789abcdef' }))).toBe('Session 01234567');
});

test('a waiting state reads as waiting, leaving "question waiting" to the marker; the others as themselves, each in a status colour', () => {
  expect(OrchestratorSessionUtil.stateWordOf('waiting-for-answer')).toBe('waiting');
  expect(OrchestratorSessionUtil.stateWordOf('busy')).toBe('busy');
  expect(OrchestratorSessionUtil.statePaletteOf('busy')).toBe('in-progress');
  expect(OrchestratorSessionUtil.statePaletteOf('ended')).toBe('abandoned');
});

test('a question waits only on a live dashboard-owned session holding one', () => {
  const waiting = orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [PENDING_QUESTION] });
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example', { orchestrator: waiting }))).toBe(true);
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example', { orchestrator: { ...waiting, state: 'ended' } }))).toBe(false);
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example'))).toBe(false);
});

test('a Start is offered with no dashboard-owned session or an ended one', () => {
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example'))).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { orchestrator: orchestratorSessionWith({ state: 'ended' }) }))).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { orchestrator: orchestratorSessionWith() }))).toBe(false);
});
