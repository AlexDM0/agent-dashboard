import type { OrchestratorSession, OrchestratorState, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';

const SHORT_SESSION_ID_LENGTH = 8;

const STATE_WORD: Partial<Record<OrchestratorState, string>> = { 'waiting-for-answer': 'waiting' };

/** Each state in a `[data-state]` colour: busy as work in progress, a question as work awaiting the user. */
const STATE_PALETTE: Record<OrchestratorState, string> = {
  'starting':           'paused',
  'busy':               'in-progress',
  'idle':               'pending',
  'waiting-for-answer': 'in-review',
  'ended':              'abandoned',
};

/** The project's sessions, the dashboard-owned one first, then the watched ones in the snapshot's order. */
function sessionsOf(project: ProjectSnapshot, watchedSessions: OrchestratorSession[]): OrchestratorSession[] {
  return project.orchestrator === null ? watchedSessions : [project.orchestrator, ...watchedSessions];
}

function watchedSessionsOf(watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>, trackerId: string): OrchestratorSession[] {
  return Object.hasOwn(watchedOrchestratorsByTracker, trackerId) ? watchedOrchestratorsByTracker[trackerId] ?? [] : [];
}

function nameOf(session: OrchestratorSession): string {
  if (session.ownership === 'dashboard') return 'Dashboard orchestrator';
  return session.name ?? `Session ${session.sessionId.slice(0, SHORT_SESSION_ID_LENGTH)}`;
}

function stateWordOf(state: OrchestratorState): string {
  return STATE_WORD[state] ?? state;
}

function statePaletteOf(state: OrchestratorState): string {
  return STATE_PALETTE[state];
}

/** What a session's glyph says on hover: its name, its state and, when it has one, its last action. */
function hoverTextOf(session: OrchestratorSession): string {
  const nameAndState = `${nameOf(session)} · ${stateWordOf(session.state)}`;
  return session.lastAction === null ? nameAndState : `${nameAndState} · ${session.lastAction.text}`;
}

/** The questions a live dashboard-owned session owes; an ended one owes none. */
function questionCountOf(project: ProjectSnapshot): number {
  if (project.orchestrator === null || project.orchestrator.state === 'ended') return 0;
  return project.orchestrator.pendingQuestions.length;
}

function isQuestionWaiting(project: ProjectSnapshot): boolean {
  return questionCountOf(project) > 0;
}

/** A Start is offered while no dashboard-owned session lives: none ran, or the one that ran has ended. */
function canStart(project: ProjectSnapshot): boolean {
  return project.orchestrator === null || project.orchestrator.state === 'ended';
}

export const OrchestratorSessionUtil = Object.freeze({
  sessionsOf, watchedSessionsOf, nameOf, stateWordOf, statePaletteOf, hoverTextOf, questionCountOf, isQuestionWaiting, canStart
});
