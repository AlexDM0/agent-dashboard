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
  if (conversation.isSendOnly) return 'desktop · send-only';
  if (session.state === 'ended') return session.lastAction === null ? 'ended' : `ended · ${session.lastAction.text}`;
  if (session.pendingQuestions.length > 0) return 'question waiting';
  return session.lastAction?.text ?? OrchestratorSessionUtil.stateWordOf(session.state);
}

const ROLE_WORDS: Record<SessionRole, string> = { 'orchestrator': 'orchestrator', 'product-owner': 'product owner' };

const ROLE_TITLES: Record<SessionRole, string> = { 'orchestrator': 'Orchestrator', 'product-owner': 'Product owner' };

function roleWordOf(role: SessionRole): string {
  return ROLE_WORDS[role];
}

/** A dashboard session is named by its role, a watched desktop one by its own name. */
function titleOf(conversation: ChatConversation): string {
  return conversation.isSendOnly ? OrchestratorSessionUtil.nameOf(conversation.session, conversation.role) : ROLE_TITLES[conversation.role];
}

function isLive(conversation: ChatConversation): boolean {
  return conversation.session.state !== 'ended';
}

function isWaitingForAnswer(conversation: ChatConversation): boolean {
  return isLive(conversation) && conversation.session.pendingQuestions.length > 0;
}

function liveCountOf(conversations: ChatConversation[]): number {
  return conversations.filter((conversation) => isLive(conversation)).length;
}

/** Sessions owing the user an answer, however many questions each owes: the header's badge. */
function waitingCountOf(conversations: ChatConversation[]): number {
  return conversations.filter((conversation) => isWaitingForAnswer(conversation)).length;
}

function oldestQuestionTimeOf(conversation: ChatConversation): number {
  const times = conversation.session.pendingQuestions.map((pendingQuestion) => Date.parse(pendingQuestion.askedAt)).filter((time) => !Number.isNaN(time));
  return times.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...times);
}

/** The session the header's Chat button opens: the one waiting longest for an answer, else the last one opened, else the first live one. */
function openingKeyOf(conversations: ChatConversation[], lastOpenedKey: string | null): string | null {
  const waiting = conversations.filter((conversation) => isWaitingForAnswer(conversation));
  const longestWaiting = waiting.toSorted((a, b) => oldestQuestionTimeOf(a) - oldestQuestionTimeOf(b))[0];
  if (longestWaiting !== undefined) return longestWaiting.key;
  if (conversations.some((conversation) => conversation.key === lastOpenedKey)) return lastOpenedKey;
  return conversations.find((conversation) => isLive(conversation))?.key ?? null;
}

/** The session a crew drawer tab shows: the role's dashboard-owned one, else the project's first watched orchestrator. */
function crewSessionKeyOf(conversations: ChatConversation[], trackerId: string, role: SessionRole): string | null {
  const ofTab = conversations.filter((conversation) => conversation.trackerId === trackerId && conversation.role === role);
  return (ofTab.find((conversation) => !conversation.isSendOnly) ?? ofTab[0])?.key ?? null;
}

export const ChatConversationListUtil = Object.freeze({
  dashboardKeyOf,
  conversationsOf,
  statusLineOf,
  roleWordOf,
  titleOf,
  isLive,
  isWaitingForAnswer,
  liveCountOf,
  waitingCountOf,
  openingKeyOf,
  crewSessionKeyOf,
});
