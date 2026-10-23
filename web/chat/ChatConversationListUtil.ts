import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                                from '../orchestrator/OrchestratorSessionUtil.ts';

/** One session the overlay lists: a project's dashboard-owned orchestrator or product owner, or a watched desktop orchestrator. */
export interface ChatConversation {
  key:         string;
  role:        SessionRole;
  trackerId:   string;
  projectName: string;
  session:     OrchestratorSession;
  /** A watched desktop session: its transcript is not tailed, so it only takes a message. */
  isSendOnly:  boolean;
}

const CREW_ROLES: SessionRole[] = ['orchestrator', 'product-owner'];

function dashboardKeyOf(role: SessionRole, trackerId: string): string {
  return `${role}:${trackerId}`;
}

function watchedKeyOf(trackerId: string, sessionId: string): string {
  return `watched:${trackerId}:${sessionId}`;
}

function lastActionTimeOf(conversation: ChatConversation): number {
  const at = conversation.session.lastAction?.at;
  const time = at === undefined ? Number.NaN : Date.parse(at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

type Standing = 'asking' | 'live' | 'ended';

/** The order the standings are listed in. */
const STANDINGS: Standing[] = ['asking', 'live', 'ended'];

function standingOf(conversation: ChatConversation): number {
  const { session } = conversation;
  const standing: Standing = session.state === 'ended' ? 'ended' : session.pendingQuestions.length > 0 ? 'asking' : 'live';
  return STANDINGS.indexOf(standing);
}

/** Live sessions with a question first, then by last action, newest first (none last), then the ended ones the same way. */
function compareConversations(a: ChatConversation, b: ChatConversation): number {
  const standingDifference = standingOf(a) - standingOf(b);
  if (standingDifference !== 0) return standingDifference;
  const timeA = lastActionTimeOf(a);
  const timeB = lastActionTimeOf(b);
  if (timeA === timeB) return 0;
  return timeA > timeB ? -1 : 1;
}

function conversationsOf(projects: ProjectSnapshot[], watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>): ChatConversation[] {
  const conversations = projects.flatMap((project) => {
    const dashboardConversations = CREW_ROLES.flatMap((role): ChatConversation[] => {
      const session = OrchestratorSessionUtil.dashboardSessionOf(project, role);
      return session === null
        ? []
        : [{
          key: dashboardKeyOf(role, project.trackerId), role, trackerId: project.trackerId, projectName: project.project, session, isSendOnly: false
        }];
    });
    const watchedConversations = OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId).map((session): ChatConversation => ({
      key:         watchedKeyOf(project.trackerId, session.sessionId),
      role:        'orchestrator',
      trackerId:   project.trackerId,
      projectName: project.project,
      session,
      isSendOnly:  true,
    }));
    return [...dashboardConversations, ...watchedConversations];
  });
  return conversations.toSorted(compareConversations);
}

/** The line under a conversation's name in the list. */
function statusLineOf(conversation: ChatConversation): string {
  const { session } = conversation;
  if (conversation.isSendOnly) return 'desktop app · send-only';
  if (session.state === 'ended') return session.lastAction === null ? 'ended' : `ended · ${session.lastAction.text}`;
  if (session.pendingQuestions.length > 0) return 'question waiting';
  return session.lastAction?.text ?? OrchestratorSessionUtil.stateWordOf(session.state);
}

export const ChatConversationListUtil = Object.freeze({
  dashboardKeyOf,
  conversationsOf,
  statusLineOf,
});
