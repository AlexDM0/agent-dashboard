import type { DashboardSnapshot, OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { InboxUtil }                                                    from '../inbox/InboxUtil.ts';
import { ContextUsageUtil }                                             from '../orchestrator/ContextUsageUtil.ts';

export type NotificationKind = 'question-asked' | 'dispatcher-ended' | 'orchestrator-ended' | 'context-past-threshold';

export interface DueNotification {
  kind:      NotificationKind;
  trackerId: string;
  project:   string;
  text:      string;
  /** One per occurrence, so a notification raised twice replaces itself rather than stacking. */
  tag:       string;
}

function projectsByTrackerOf(snapshot: DashboardSnapshot): Map<string, ProjectSnapshot> {
  return new Map(snapshot.projects.map((project) => [project.trackerId, project]));
}

function questionsAsked(previous: DashboardSnapshot, next: DashboardSnapshot): DueNotification[] {
  const previousRequestKeys = new Set(InboxUtil.entriesOf(previous.projects).map((entry) => `${entry.trackerId}\n${entry.pendingQuestion.requestId}`));
  return InboxUtil.entriesOf(next.projects)
    .filter((entry) => !previousRequestKeys.has(`${entry.trackerId}\n${entry.pendingQuestion.requestId}`))
    .map((entry) => ({
      kind:      'question-asked',
      trackerId: entry.trackerId,
      project:   entry.project,
      text:      `The orchestrator asks: ${entry.pendingQuestion.questions[0]?.question ?? 'a question'}`,
      tag:       `question-asked:${entry.trackerId}:${entry.pendingQuestion.requestId}`,
    }));
}

function dispatcherRunsEnded(previousProjects: Map<string, ProjectSnapshot>, next: DashboardSnapshot): DueNotification[] {
  const notifications: DueNotification[] = [];
  for (const project of next.projects) {
    const previousHealth = previousProjects.get(project.trackerId)?.health;
    if (previousHealth?.kind !== 'ready' || previousHealth.board.dispatcherState !== 'running') continue;
    if (project.health.kind !== 'ready' || project.health.board.dispatcherState === 'running') continue;
    notifications.push({
      kind:      'dispatcher-ended',
      trackerId: project.trackerId,
      project:   project.project,
      text:      `The dispatcher run ${project.health.board.dispatcherState === 'stopped' ? 'stopped' : 'finished'}`,
      tag:       `dispatcher-ended:${project.trackerId}:${previousHealth.board.dispatcherRunId ?? ''}`,
    });
  }
  return notifications;
}

function orchestratorsEnded(previousProjects: Map<string, ProjectSnapshot>, next: DashboardSnapshot): DueNotification[] {
  const notifications: DueNotification[] = [];
  for (const project of next.projects) {
    const previousSession = previousProjects.get(project.trackerId)?.orchestrator ?? null;
    const session = project.orchestrator;
    if (previousSession === null || previousSession.state === 'ended' || session?.sessionId !== previousSession.sessionId || session.state !== 'ended') continue;
    notifications.push({
      kind:      'orchestrator-ended',
      trackerId: project.trackerId,
      project:   project.project,
      text:      'The orchestrator session ended',
      tag:       `orchestrator-ended:${session.sessionId}`,
    });
  }
  return notifications;
}

/** Every session of a project, the dashboard's own and the watched ones, by session id. */
function sessionsOf(snapshot: DashboardSnapshot, project: ProjectSnapshot): OrchestratorSession[] {
  const watchedSessions = Object.hasOwn(snapshot.watchedOrchestratorsByTracker, project.trackerId) ? snapshot.watchedOrchestratorsByTracker[project.trackerId] ?? [] : [];
  return project.orchestrator === null ? watchedSessions : [project.orchestrator, ...watchedSessions];
}

function contextsPastThreshold(previous: DashboardSnapshot, previousProjects: Map<string, ProjectSnapshot>, next: DashboardSnapshot): DueNotification[] {
  const notifications: DueNotification[] = [];
  for (const project of next.projects) {
    const previousProject = previousProjects.get(project.trackerId);
    if (previousProject === undefined) continue;
    const previousSessions = new Map(sessionsOf(previous, previousProject).map((session) => [session.sessionId, session]));
    for (const session of sessionsOf(next, project)) {
      const previousSession = previousSessions.get(session.sessionId);
      if (previousSession === undefined || session.state === 'ended') continue;
      if (ContextUsageUtil.suggestsHandoff(previousSession.context) || !ContextUsageUtil.suggestsHandoff(session.context)) continue;
      const sessionWord = session.ownership === 'dashboard' ? 'The orchestrator' : 'A watched session';
      notifications.push({
        kind:      'context-past-threshold',
        trackerId: project.trackerId,
        project:   project.project,
        text:      `${sessionWord}'s context is at ${ContextUsageUtil.captionOf(session.context)}`,
        tag:       `context-past-threshold:${session.sessionId}`,
      });
    }
  }
  return notifications;
}

/**
 * What changed for the user between two consecutive snapshots. A null previous snapshot is the baseline of a fresh
 * connection, so it gives none: only a transition seen on this connection is news.
 */
function notificationsDueOf(previous: DashboardSnapshot | null, next: DashboardSnapshot): DueNotification[] {
  if (previous === null) return [];
  const previousProjects = projectsByTrackerOf(previous);
  return [
    ...questionsAsked(previous, next),
    ...dispatcherRunsEnded(previousProjects, next),
    ...orchestratorsEnded(previousProjects, next),
    ...contextsPastThreshold(previous, previousProjects, next),
  ];
}

export interface NotificationGate {
  optedIn:    boolean;
  muted:      boolean;
  permission: NotificationPermission | 'unsupported';
  tabFocused: boolean;
}

/** A notification is raised only for a user who opted in and granted it, not muted, and not looking at the tab already. */
function mayRaise(gate: NotificationGate): boolean {
  return gate.optedIn && !gate.muted && gate.permission === 'granted' && !gate.tabFocused;
}

export const NotificationTransitionUtil = Object.freeze({ notificationsDueOf, mayRaise });
