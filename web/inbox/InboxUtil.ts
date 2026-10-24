import type {
  OrchestratorSession,
  PendingQuestion,
  ProjectSnapshot,
  QuestionContext,
  SessionRole
} from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }   from '../orchestrator/ContextUsageUtil.ts';
import { SessionRefreshUtil } from '../orchestrator/SessionRefreshUtil.ts';

const SESSION_ROLES: SessionRole[] = ['orchestrator', 'product-owner'];

export interface InboxEntry {
  trackerId:       string;
  project:         string;
  /** Who asks: the project's orchestrator or its product owner. */
  role:            SessionRole;
  session:         OrchestratorSession;
  pendingQuestion: PendingQuestion;
}

/** A live dashboard-owned orchestrator at or past the critical context share, computed from the snapshot, never stored. */
export interface InboxAlert {
  trackerId:      string;
  project:        string;
  session:        OrchestratorSession;
  contextPercent: number;
  /** Why the server would refuse a handoff now, in its own words; null when it would take one. */
  handoffRefusal: string | null;
}

export type InboxFilter = 'all' | 'questions' | 'alerts';

export type InboxContextRow =
  | { kind: 'doing'; dispatcherRunId: string }
  | { kind: 'mentions'; ticketIds: string[] }
  | { kind: 'said'; line: string };

const SHOWN_RUN_ID_CHARACTERS = 8;
const PERCENT = 100;

/** A stamp that does not parse sorts after every one that does, so a malformed one never hides a real wait. */
function askedAtEpochOf(entry: InboxEntry): number {
  const askedAtEpoch = Date.parse(entry.pendingQuestion.askedAt);
  return Number.isNaN(askedAtEpoch) ? Number.POSITIVE_INFINITY : askedAtEpoch;
}

function compareByAskedAt(a: InboxEntry, b: InboxEntry): number {
  const difference = askedAtEpochOf(a) - askedAtEpochOf(b);
  if (difference !== 0 && !Number.isNaN(difference)) return difference;
  return a.trackerId.localeCompare(b.trackerId) || a.pendingQuestion.requestId.localeCompare(b.pendingQuestion.requestId);
}

/** Every pending question of a live dashboard-owned orchestrator or product owner, across every project, the longest waiting first. */
function entriesOf(projects: ProjectSnapshot[]): InboxEntry[] {
  const entries: InboxEntry[] = [];
  for (const project of projects) {
    for (const role of SESSION_ROLES) {
      const session = SessionRefreshUtil.liveDashboardSessionOf(project, role);
      // A stopping session's question is never answered: its turn is being cut short.
      if (session === null || session.state === 'stopping') continue;
      for (const pendingQuestion of session.pendingQuestions) {
        entries.push({
          trackerId: project.trackerId, project: project.project, role, session, pendingQuestion
        });
      }
    }
  }
  return entries.sort(compareByAskedAt);
}

/** One alert per live dashboard-owned orchestrator whose known context share is at or past the critical one, in project order. */
function alertsOf(projects: ProjectSnapshot[]): InboxAlert[] {
  const alerts: InboxAlert[] = [];
  for (const project of projects) {
    const session = SessionRefreshUtil.refreshDueSessionOf(project);
    const context = session?.context ?? null;
    if (session === null || context === null) continue;
    const share = ContextUsageUtil.shareOf(context) ?? 1;
    alerts.push({
      trackerId:      project.trackerId,
      project:        project.project,
      session,
      contextPercent: Math.round(share * PERCENT),
      handoffRefusal: SessionRefreshUtil.handoffRefusalOf(project, session),
    });
  }
  return alerts;
}

/** Doing, Mentions and Said, in that order, each left out when its part of the context is empty. */
function contextRowsOf(context: QuestionContext): InboxContextRow[] {
  const rows: InboxContextRow[] = [];
  if (context.dispatcherRunId !== null && context.dispatcherRunId !== '') {
    rows.push({ kind: 'doing', dispatcherRunId: context.dispatcherRunId.slice(0, SHOWN_RUN_ID_CHARACTERS) });
  }
  if (context.mentionedTicketIds.length > 0) rows.push({ kind: 'mentions', ticketIds: context.mentionedTicketIds });
  if (context.lastAssistantLine !== null && context.lastAssistantLine.trim() !== '') {
    rows.push({ kind: 'said', line: context.lastAssistantLine });
  }
  return rows;
}

/** `(<n>) ` ahead of the page's own title while a question or an alert waits; the bare title at zero. */
function documentTitleOf(waitingCount: number, pageTitle: string): string {
  return waitingCount > 0 ? `(${String(waitingCount)}) ${pageTitle}` : pageTitle;
}

export const InboxUtil = Object.freeze({
  entriesOf, alertsOf, contextRowsOf, documentTitleOf
});
