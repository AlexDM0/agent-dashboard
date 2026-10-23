/**
 * What the drawer, the cards and the rail say about a project's sessions: the dashboard-owned one first, a name for
 * every session (a watched one without a record name by its short id), the state words and colours, a glyph's hover
 * text, how many questions wait, and when a Start is offered; an ended session neither waits nor blocks a new start,
 * and is not shown at all.
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
  expect(OrchestratorSessionUtil.stateWordOf('stopping')).toBe('stopping');
  expect(OrchestratorSessionUtil.statePaletteOf('stopping')).toBe('paused');
});

test('a question waits only on a live dashboard-owned session holding one', () => {
  const waiting = orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [PENDING_QUESTION] });
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example', { orchestrator: waiting }))).toBe(true);
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example', { orchestrator: { ...waiting, state: 'ended' } }))).toBe(false);
  expect(OrchestratorSessionUtil.isQuestionWaiting(projectSnapshotWith('example'))).toBe(false);
});

test('a live session counts its questions for the rail badge; an ended one and none count zero', () => {
  const waiting = orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [PENDING_QUESTION, { ...PENDING_QUESTION, requestId: 'second' }] });
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example', { orchestrator: waiting }))).toBe(2);
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example', { orchestrator: { ...waiting, state: 'ended' } }))).toBe(0);
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example'))).toBe(0);
});

test('a glyph names its session and state on hover, and the last action once there is one', () => {
  const session = orchestratorSessionWith({ state: 'busy' });
  expect(OrchestratorSessionUtil.hoverTextOf(session)).toBe('Dashboard orchestrator · busy');
  const acting = orchestratorSessionWith({ state: 'busy', lastAction: { at: '2026-10-21T10:00:00+02:00', text: 'Started #042' } });
  expect(OrchestratorSessionUtil.hoverTextOf(acting)).toBe('Dashboard orchestrator · busy · Started #042');
});

test('the product owner is named, marked and coloured as its own role: purple when idle, the state colour otherwise', () => {
  expect(OrchestratorSessionUtil.nameOf(orchestratorSessionWith(), 'product-owner')).toBe('Product owner');
  expect(OrchestratorSessionUtil.markOf('product-owner')).toBe('PO');
  expect(OrchestratorSessionUtil.statePaletteOf('idle', 'product-owner')).toBe('delivered');
  expect(OrchestratorSessionUtil.statePaletteOf('waiting-for-answer', 'product-owner')).toBe('in-review');
  expect(OrchestratorSessionUtil.statePaletteOf('idle')).toBe('pending');
});

test('the rail badge counts the product owner\'s questions beside the orchestrator\'s', () => {
  const productOwner = orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [PENDING_QUESTION] });
  const asking = projectSnapshotWith('example', { productOwner });
  expect(OrchestratorSessionUtil.questionCountOf(asking)).toBe(1);
  expect(OrchestratorSessionUtil.roleQuestionCountOf(asking, 'product-owner')).toBe(1);
  expect(OrchestratorSessionUtil.roleQuestionCountOf(asking, 'orchestrator')).toBe(0);
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example', { productOwner, orchestrator: productOwner }))).toBe(2);
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example', { productOwner: { ...productOwner, state: 'ended' } }))).toBe(0);
});

test('the drawer leads with the product owner only while it alone asks', () => {
  const asking = orchestratorSessionWith({ state: 'waiting-for-answer', pendingQuestions: [PENDING_QUESTION] });
  expect(OrchestratorSessionUtil.askingRoleOf(projectSnapshotWith('example', { productOwner: asking }))).toBe('product-owner');
  expect(OrchestratorSessionUtil.askingRoleOf(projectSnapshotWith('example', { productOwner: asking, orchestrator: asking }))).toBe('orchestrator');
  expect(OrchestratorSessionUtil.askingRoleOf(projectSnapshotWith('example'))).toBe('orchestrator');
});

test('a product owner Start is offered while none lives, whatever the orchestrator does', () => {
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { orchestrator: orchestratorSessionWith() }), 'product-owner')).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { productOwner: orchestratorSessionWith({ state: 'ended' }) }), 'product-owner')).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { productOwner: orchestratorSessionWith() }), 'product-owner')).toBe(false);
});

test('a Start is offered with no dashboard-owned session or an ended one', () => {
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example'))).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { orchestrator: orchestratorSessionWith({ state: 'ended' }) }))).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectSnapshotWith('example', { orchestrator: orchestratorSessionWith() }))).toBe(false);
});

test('only a live session is shown: every state but ended, and no session at all', () => {
  const liveStates = ['starting', 'busy', 'idle', 'waiting-for-answer'] as const;
  for (const state of liveStates) expect(OrchestratorSessionUtil.isShown(orchestratorSessionWith({ state }))).toBe(true);
  expect(OrchestratorSessionUtil.isShown(orchestratorSessionWith({ state: 'ended' }))).toBe(false);
  expect(OrchestratorSessionUtil.isShown(null)).toBe(false);
});

test('an ended or absent product owner is not shown, a live one is', () => {
  const live = orchestratorSessionWith({ state: 'idle' });
  expect(OrchestratorSessionUtil.shownProductOwnerOf(projectSnapshotWith('example', { productOwner: live }))).toBe(live);
  expect(OrchestratorSessionUtil.shownProductOwnerOf(projectSnapshotWith('example', { productOwner: orchestratorSessionWith({ state: 'ended' }) }))).toBeNull();
  expect(OrchestratorSessionUtil.shownProductOwnerOf(projectSnapshotWith('example', { productOwner: null }))).toBeNull();
});

test('a card shows stopping from the confirmed Stop on, whatever the snapshot said, until the snapshot says ended', () => {
  expect(OrchestratorSessionUtil.shownStateOf(orchestratorSessionWith({ state: 'busy' }), true)).toBe('stopping');
  expect(OrchestratorSessionUtil.shownStateOf(orchestratorSessionWith({ state: 'waiting-for-answer' }), true)).toBe('stopping');
  expect(OrchestratorSessionUtil.shownStateOf(orchestratorSessionWith({ state: 'stopping' }), false)).toBe('stopping');
  expect(OrchestratorSessionUtil.shownStateOf(orchestratorSessionWith({ state: 'ended' }), true)).toBe('ended');
  expect(OrchestratorSessionUtil.shownStateOf(orchestratorSessionWith({ state: 'busy' }), false)).toBe('busy');
});

test('a stopping session owes no questions, so neither the rail nor the strip counts them', () => {
  const stopping = orchestratorSessionWith({ state: 'stopping', pendingQuestions: [PENDING_QUESTION] });
  expect(OrchestratorSessionUtil.questionCountOf(projectSnapshotWith('example', { orchestrator: stopping }))).toBe(0);
});
