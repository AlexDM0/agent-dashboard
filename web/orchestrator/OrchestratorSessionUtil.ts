import type {
  OrchestratorSession,
  OrchestratorState,
  ProjectSnapshot,
  SessionRole
} from '../../src/shared/DashboardContract.ts';

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

/** An idle product owner is told apart from an idle orchestrator by its own colour. */
const IDLE_PRODUCT_OWNER_PALETTE = 'delivered';

const DASHBOARD_SESSION_NAMES: Record<SessionRole, string> = { 'orchestrator': 'Dashboard orchestrator', 'product-owner': 'Product owner' };

/** The crew member's two-letter mark on its glyph. */
const ROLE_MARKS: Record<SessionRole, string> = { 'orchestrator': 'OR', 'product-owner': 'PO' };

/** The project's sessions, the dashboard-owned one first, then the watched ones in the snapshot's order. */
function sessionsOf(project: ProjectSnapshot, watchedSessions: OrchestratorSession[]): OrchestratorSession[] {
  return project.orchestrator === null ? watchedSessions : [project.orchestrator, ...watchedSessions];
}

function watchedSessionsOf(watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>, trackerId: string): OrchestratorSession[] {
  return Object.hasOwn(watchedOrchestratorsByTracker, trackerId) ? watchedOrchestratorsByTracker[trackerId] ?? [] : [];
}

/** The project's dashboard-owned session of the role, live or ended; null for none. */
function dashboardSessionOf(project: ProjectSnapshot, role: SessionRole): OrchestratorSession | null {
  return role === 'orchestrator' ? project.orchestrator : project.productOwner;
}

function markOf(role: SessionRole): string {
  return ROLE_MARKS[role];
}

function nameOf(session: OrchestratorSession, role: SessionRole = 'orchestrator'): string {
  if (session.ownership === 'dashboard') return DASHBOARD_SESSION_NAMES[role];
  return session.name ?? `Session ${session.sessionId.slice(0, SHORT_SESSION_ID_LENGTH)}`;
}

function stateWordOf(state: OrchestratorState): string {
  return STATE_WORD[state] ?? state;
}

function statePaletteOf(state: OrchestratorState, role: SessionRole = 'orchestrator'): string {
  return role === 'product-owner' && state === 'idle' ? IDLE_PRODUCT_OWNER_PALETTE : STATE_PALETTE[state];
}

/** What a session's glyph says on hover: its name, its state and, when it has one, its last action. */
function hoverTextOf(session: OrchestratorSession, role: SessionRole = 'orchestrator'): string {
  const nameAndState = `${nameOf(session, role)} · ${stateWordOf(session.state)}`;
  return session.lastAction === null ? nameAndState : `${nameAndState} · ${session.lastAction.text}`;
}

/** The questions the role's live dashboard-owned session owes; an ended one owes none. */
function roleQuestionCountOf(project: ProjectSnapshot, role: SessionRole): number {
  const session = dashboardSessionOf(project, role);
  if (session === null || session.state === 'ended') return 0;
  return session.pendingQuestions.length;
}

/** The questions the orchestrator and the product owner owe together, as the rail badge counts them. */
function questionCountOf(project: ProjectSnapshot): number {
  return roleQuestionCountOf(project, 'orchestrator') + roleQuestionCountOf(project, 'product-owner');
}

function isQuestionWaiting(project: ProjectSnapshot): boolean {
  return questionCountOf(project) > 0;
}

/** The role whose questions should be seen first: the product owner while it alone asks, else the orchestrator. */
function askingRoleOf(project: ProjectSnapshot): SessionRole {
  const isProductOwnerAloneAsking = roleQuestionCountOf(project, 'product-owner') > 0 && roleQuestionCountOf(project, 'orchestrator') === 0;
  return isProductOwnerAloneAsking ? 'product-owner' : 'orchestrator';
}

/** A Start is offered while no dashboard-owned session of the role lives: none ran, or the one that ran has ended. */
function canStart(project: ProjectSnapshot, role: SessionRole = 'orchestrator'): boolean {
  const session = dashboardSessionOf(project, role);
  return session === null || session.state === 'ended';
}

export const OrchestratorSessionUtil = Object.freeze({
  sessionsOf,
  watchedSessionsOf,
  dashboardSessionOf,
  markOf,
  nameOf,
  stateWordOf,
  statePaletteOf,
  hoverTextOf,
  roleQuestionCountOf,
  questionCountOf,
  isQuestionWaiting,
  askingRoleOf,
  canStart,
});
