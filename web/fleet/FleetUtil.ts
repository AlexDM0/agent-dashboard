import type { BoardSummary, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import type { InboxEntry }                                 from '../inbox/InboxUtil.ts';
import { ContextUsageUtil }                                from '../orchestrator/ContextUsageUtil.ts';
import { OrchestratorSessionUtil }                         from '../orchestrator/OrchestratorSessionUtil.ts';
import { ProjectOrdering }                                 from '../overview/ProjectOrdering.ts';

export type FleetFilter = 'all' | 'running' | 'needs-you';

/** One card of the Needs you column: a question the inbox holds, or a dashboard-owned session due a refresh. */
export type AttentionCard =
  | { kind: 'question'; trackerId: string; project: string; role: SessionRole; requestId: string; firstLine: string; askedAt: string }
  | { kind: 'handoff'; trackerId: string; project: string; contextCaption: string; measuredAt: string };

export interface QueueSummary {
  readyCount: number;
  /** `n low`, `n review`, `n held`, in that order, the zero ones left out. */
  quietParts: string[];
}

/** The overview's order: the active group, then the idle one, each alphabetical. */
function orderedProjectsOf(projects: ProjectSnapshot[]): ProjectSnapshot[] {
  const groups = ProjectOrdering.grouped(projects, 'all', '');
  return [...groups.active, ...groups.idle];
}

function isRunning(project: ProjectSnapshot): boolean {
  return project.health.kind === 'ready' && project.health.board.dispatcherState === 'running';
}

/** Only a live dashboard-owned session is offered Refresh orchestrator, so only its context can be critical here. */
function isContextCritical(project: ProjectSnapshot): boolean {
  const session = project.orchestrator;
  return session !== null && session.state !== 'ended' && ContextUsageUtil.suggestsHandoff(session.context);
}

function needsYou(project: ProjectSnapshot): boolean {
  return OrchestratorSessionUtil.isQuestionWaiting(project) || isContextCritical(project);
}

function rowsOf(projects: ProjectSnapshot[], filter: FleetFilter): ProjectSnapshot[] {
  const ordered = orderedProjectsOf(projects);
  if (filter === 'running') return ordered.filter((project) => isRunning(project));
  if (filter === 'needs-you') return ordered.filter((project) => needsYou(project));
  return ordered;
}

function firstLineOf(text: string): string {
  return text.split('\n', 1)[0]?.trim() ?? '';
}

/** The inbox's entries in the inbox's order, then a refresh card per critical session in the fleet's order. */
function attentionCardsOf(inboxEntries: InboxEntry[], projects: ProjectSnapshot[]): AttentionCard[] {
  const questionCards: AttentionCard[] = inboxEntries.map((entry) => ({
    kind:      'question',
    trackerId: entry.trackerId,
    project:   entry.project,
    role:      entry.role,
    requestId: entry.pendingQuestion.requestId,
    firstLine: firstLineOf(entry.pendingQuestion.questions[0]?.question ?? ''),
    askedAt:   entry.pendingQuestion.askedAt,
  }));
  const handoffCards: AttentionCard[] = [];
  for (const project of orderedProjectsOf(projects)) {
    const context = project.orchestrator?.context ?? null;
    if (context !== null && isContextCritical(project)) {
      handoffCards.push({
        kind: 'handoff', trackerId: project.trackerId, project: project.project, contextCaption: ContextUsageUtil.captionOf(context), measuredAt: context.measuredAt
      });
    }
  }
  return [...questionCards, ...handoffCards];
}

function queueSummaryOf(board: BoardSummary): QueueSummary {
  const quietCounts: [number, string][] = [
    [board.lowPriorityWaitingTickets.length, 'low'],
    [board.reviewWaitingTicketIds.length, 'review'],
    [board.heldTicketIds.length, 'held'],
  ];
  return {
    readyCount: board.readyTicketIds.length,
    quietParts: quietCounts.filter(([count]) => count > 0).map(([count, word]) => `${String(count)} ${word}`),
  };
}

export const FleetUtil = Object.freeze({
  orderedProjectsOf, isRunning, needsYou, rowsOf, attentionCardsOf, queueSummaryOf
});
