import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }                                       from './ContextUsageUtil.ts';
import { OrchestratorSessionUtil }                                from './OrchestratorSessionUtil.ts';

/** The project's dashboard-owned session of the role while it lives; null for none, an ended one or a watched one. */
function liveDashboardSessionOf(project: ProjectSnapshot, role: SessionRole = 'orchestrator'): OrchestratorSession | null {
  const session = OrchestratorSessionUtil.dashboardSessionOf(project, role);
  if (session === null || session.state === 'ended' || session.ownership !== 'dashboard') return null;
  return session;
}

/** The live dashboard-owned orchestrator whose known context share is at or past the critical one; null when none is. */
function refreshDueSessionOf(project: ProjectSnapshot): OrchestratorSession | null {
  const session = liveDashboardSessionOf(project);
  return session !== null && ContextUsageUtil.suggestsHandoff(session.context) ? session : null;
}

function isRefreshDue(project: ProjectSnapshot): boolean {
  return refreshDueSessionOf(project) !== null;
}

/** The server's handoff refusals, in its order and words, so the button is disabled exactly while a click would be refused. */
function handoffRefusalOf(project: ProjectSnapshot, session: OrchestratorSession): string | null {
  if (session.pendingQuestions.length > 0 || session.state === 'waiting-for-answer') {
    return 'A question of the orchestrator is pending; answer it before refreshing';
  }
  if (session.state !== 'idle') return `The orchestrator is ${session.state}; refresh once it is idle`;
  if (project.health.kind !== 'ready') return 'The board cannot be read, so whether its dispatcher runs is unknown';
  if (project.health.board.dispatcherState === 'running') return 'The board\'s dispatcher is running; refresh once it has stopped or finished';
  return null;
}

export const SessionRefreshUtil = Object.freeze({
  liveDashboardSessionOf, refreshDueSessionOf, isRefreshDue, handoffRefusalOf
});
