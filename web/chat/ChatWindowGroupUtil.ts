import type { ProjectSnapshot }                            from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                         from '../orchestrator/OrchestratorSessionUtil.ts';
import { ProjectOrdering }                                 from '../overview/ProjectOrdering.ts';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';

export type ChatListFilter = 'all' | 'waiting';

/** One project in the chat window's left column: its live crew sessions and whether a product owner can be started. */
export interface ChatProjectGroup {
  project:            ProjectSnapshot;
  conversations:      ChatConversation[];
  offersProductOwner: boolean;
}

export interface ChatWindowGroups {
  projectGroups:      ChatProjectGroup[];
  endedConversations: ChatConversation[];
}

/** Projects in the rail's order, active then idle; an idle project with no live session is left out. */
function groupsOf(projects: ProjectSnapshot[], conversations: ChatConversation[]): ChatWindowGroups {
  const railGroups = ProjectOrdering.grouped(projects, 'all', '');
  const projectGroups = [...railGroups.active, ...railGroups.idle].flatMap((project): ChatProjectGroup[] => {
    const liveConversations = conversations.filter((conversation) => conversation.trackerId === project.trackerId && ChatConversationListUtil.isLive(conversation));
    if (liveConversations.length === 0 && !ProjectOrdering.isActive(project)) return [];
    return [{ project, conversations: liveConversations, offersProductOwner: OrchestratorSessionUtil.canStart(project, 'product-owner') }];
  });
  const endedConversations = conversations.filter((conversation) => !ChatConversationListUtil.isLive(conversation));
  return { projectGroups, endedConversations };
}

function matchesSearch(conversation: ChatConversation, needle: string): boolean {
  return needle === '' || conversation.projectName.toLowerCase().includes(needle) || ChatConversationListUtil.roleWordOf(conversation.role).includes(needle);
}

function conversationMatches(conversation: ChatConversation, needle: string, filter: ChatListFilter): boolean {
  return matchesSearch(conversation, needle) && (filter === 'all' || ChatConversationListUtil.isWaitingForAnswer(conversation));
}

/** The search matches a project's name or a session's role; "Waiting for you" keeps the sessions owing an answer and drops the projects left empty. */
function filteredOf(groups: ChatWindowGroups, searchText: string, filter: ChatListFilter): ChatWindowGroups {
  const needle = searchText.trim().toLowerCase();
  const isNarrowed = needle !== '' || filter !== 'all';
  const projectGroups = groups.projectGroups.flatMap((group): ChatProjectGroup[] => {
    const conversations = group.conversations.filter((conversation) => conversationMatches(conversation, needle, filter));
    const isProjectNamed = filter === 'all' && needle !== '' && group.project.project.toLowerCase().includes(needle);
    if (isProjectNamed) return [group];
    if (isNarrowed && conversations.length === 0) return [];
    return [{ ...group, conversations }];
  });
  const endedConversations = filter === 'waiting' ? [] : groups.endedConversations.filter((conversation) => matchesSearch(conversation, needle));
  return { projectGroups, endedConversations };
}

export const ChatWindowGroupUtil = Object.freeze({
  groupsOf,
  filteredOf,
});
