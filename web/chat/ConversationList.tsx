import { useId }                                                   from 'react';
import { EndedFold }                                               from '../orchestrator/EndedFold.tsx';
import { EndedSessionSplitUtil }                                   from '../orchestrator/EndedSessionSplitUtil.ts';
import { OrchestratorSessionUtil }                                 from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                                            from '../orchestrator/SessionGlyph.tsx';
import { projectActivityOf }                                       from '../shell/ProjectActivity.ts';
import { ProjectDot }                                              from '../shell/ProjectDot.tsx';
import { TimeUtil }                                                from '../time/TimeUtil.ts';
import { type ChatConversation, ChatConversationListUtil }         from './ChatConversationListUtil.ts';
import type { ChatListFilter, ChatProjectGroup, ChatWindowGroups } from './ChatWindowGroupUtil.ts';
import { InFlightAgentLine }                                       from './InFlightAgentLine.tsx';
import { ProductOwnerStartMenu }                                   from './ProductOwnerStartMenu.tsx';

interface ConversationListProperties {
  groups:         ChatWindowGroups;
  searchText:     string;
  filter:         ChatListFilter;
  selectedKey:    string | null;
  now:            number;
  onSearchChange: (searchText: string) => void;
  onFilterChange: (filter: ChatListFilter) => void;
  onSelect:       (key: string) => void;
  onMention:      (orchestratorKey: string, ticketId: string) => void;
}

interface ConversationEntryProperties {
  conversation: ChatConversation;
  isSelected:   boolean;
  now:          number;
  onSelect:     (key: string) => void;
}

function ConversationEntry({
  conversation, isSelected, now, onSelect
}: ConversationEntryProperties) {
  const { session, role } = conversation;
  const hasEnded = session.state === 'ended';
  const questionCount = ChatConversationListUtil.isLive(conversation) ? session.pendingQuestions.length : 0;
  const age = session.lastAction === null || conversation.isSendOnly ? '' : TimeUtil.relativeAgeOfStamp(session.lastAction.at, now);
  return (
    <li>
      <button
        type="button"
        className="ap-chat-list-entry"
        aria-current={isSelected}
        data-ended={hasEnded}
        onClick={() => onSelect(conversation.key)}
      >
        <SessionGlyph role={role} session={session} />
        <span className="ap-chat-list-text">
          <span className="ap-chat-list-name ellipsis">
            {ChatConversationListUtil.titleOf(conversation)}
            {hasEnded ? <span className="muted"> · {conversation.projectName}</span> : null}
          </span>
          <span className="muted ap-chat-list-status ellipsis">
            {hasEnded ? EndedSessionSplitUtil.endedLineOf(session) : ChatConversationListUtil.statusLineOf(conversation)}
            {age === '' || hasEnded ? null : <span className="mono"> · {age}</span>}
          </span>
        </span>
        {questionCount === 0
          ? null
          : <span className="ap-chat-question-badge" aria-label={`${String(questionCount)} ${questionCount === 1 ? 'question' : 'questions'} waiting`}>{questionCount}</span>}
      </button>
    </li>
  );
}

interface ProjectSectionProperties {
  group:       ChatProjectGroup;
  selectedKey: string | null;
  now:         number;
  onSelect:    (key: string) => void;
  onMention:   (orchestratorKey: string, ticketId: string) => void;
}

function ProjectSection({
  group, selectedKey, now, onSelect, onMention
}: ProjectSectionProperties) {
  const { project } = group;
  const board = project.health.kind === 'ready' ? project.health.board : null;
  const orchestratorKey = ChatConversationListUtil.crewSessionKeyOf(group.conversations, project.trackerId, 'orchestrator');
  return (
    <section className="ap-chat-project" aria-label={project.project}>
      <h3 className="ap-chat-project-heading">
        <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
        <span className="ellipsis" title={project.project}>{project.project}</span>
        {board === null ? null : <span className="mono muted ap-chat-project-agents" title="Agents in flight of the limit">{board.agentsInFlight}/{board.concurrencyLimit}</span>}
      </h3>
      {group.conversations.length === 0
        ? null
        : (
          <ul className="ap-chat-list">
            {group.conversations.map((conversation) => (
              <ConversationEntry key={conversation.key} conversation={conversation} isSelected={conversation.key === selectedKey} now={now} onSelect={onSelect} />
            ))}
          </ul>
        )}
      {group.inFlightRows.length === 0
        ? null
        : (
          <ul className="ap-chat-agent-lines" aria-label={`Agents in flight in ${project.project}`}>
            {group.inFlightRows.map((row) => (
              <li key={row.rowId}>
                <InFlightAgentLine row={row} {...(orchestratorKey === null ? {} : { onMention: (ticketId: string) => onMention(orchestratorKey, ticketId) })} />
              </li>
            ))}
          </ul>
        )}
      {group.offersProductOwner
        ? (
          <ProductOwnerStartMenu
            trackerId={project.trackerId}
            projectName={project.project}
            onStarted={() => onSelect(ChatConversationListUtil.dashboardKeyOf('product-owner', project.trackerId))}
          />
        )
        : null}
    </section>
  );
}

/** Every live session under its project, the project's in-flight agents beneath them, the ended ones folded away. */
export function ConversationList({
  groups, searchText, filter, selectedKey, now, onSearchChange, onFilterChange, onSelect, onMention
}: ConversationListProperties) {
  const searchId = useId();
  return (
    <nav className="ap-chat-column ap-chat-list-column" aria-label="Chat sessions">
      <div className="ap-chat-list-tools">
        <label className="ap-visually-hidden" htmlFor={searchId}>Search sessions by project or role</label>
        <div className="ap-search">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input id={searchId} type="search" placeholder="Search project or role" value={searchText} onChange={(event) => onSearchChange(event.target.value)} />
        </div>
        <div className="ap-seg" role="group" aria-label="Show sessions">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')}>All</button>
          <button type="button" aria-pressed={filter === 'waiting'} onClick={() => onFilterChange('waiting')}>Waiting for you</button>
        </div>
      </div>
      {groups.projectGroups.length === 0 ? <p className="muted ap-caption">No live session matches</p> : null}
      {groups.projectGroups.map((group) => (
        <ProjectSection key={group.project.trackerId} group={group} selectedKey={selectedKey} now={now} onSelect={onSelect} onMention={onMention} />
      ))}
      <EndedFold endedCount={groups.endedConversations.length}>
        <ul className="ap-chat-list">
          {groups.endedConversations.map((conversation) => (
            <ConversationEntry key={conversation.key} conversation={conversation} isSelected={conversation.key === selectedKey} now={now} onSelect={onSelect} />
          ))}
        </ul>
      </EndedFold>
    </nav>
  );
}
