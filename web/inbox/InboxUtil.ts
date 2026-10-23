import type { PendingQuestion, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';

export interface InboxEntry {
  trackerId:       string;
  project:         string;
  pendingQuestion: PendingQuestion;
}

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

/** Every pending question of a live dashboard-owned session, across every project, the longest waiting first. */
function entriesOf(projects: ProjectSnapshot[]): InboxEntry[] {
  const entries: InboxEntry[] = [];
  for (const project of projects) {
    const session = project.orchestrator;
    if (session === null || session.state === 'ended') continue;
    for (const pendingQuestion of session.pendingQuestions) {
      entries.push({ trackerId: project.trackerId, project: project.project, pendingQuestion });
    }
  }
  return entries.sort(compareByAskedAt);
}

/** `(<n>) ` ahead of the page's own title while a question waits; the bare title at zero. */
function documentTitleOf(pendingCount: number, pageTitle: string): string {
  return pendingCount > 0 ? `(${String(pendingCount)}) ${pageTitle}` : pageTitle;
}

export const InboxUtil = Object.freeze({ entriesOf, documentTitleOf });
