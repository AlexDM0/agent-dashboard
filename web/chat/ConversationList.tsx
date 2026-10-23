import type { ProjectSnapshot }                            from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                         from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                                    from '../orchestrator/SessionGlyph.tsx';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { NewConversationControls }                         from './NewConversationControls.tsx';

interface ConversationListProperties {
  projects:      ProjectSnapshot[];
  conversations: ChatConversation[];
  selectedKey:   string | null;
  onSelect:      (key: string) => void;
}

const ROLE_WORDS = { 'orchestrator': 'orchestrator', 'product-owner': 'product owner' } as const;

export function ConversationList({
  projects, conversations, selectedKey, onSelect
}: ConversationListProperties) {
  return (
    <nav className="ap-chat-column ap-chat-list-column" aria-label="Conversations">
      <h2 className="ap-chat-column-title">Conversations</h2>
      <NewConversationControls projects={projects} conversations={conversations} onSelect={onSelect} />
      {conversations.length === 0
        ? <p className="muted ap-caption">No orchestrator or product owner runs yet</p>
        : (
          <ul className="ap-chat-list">
            {conversations.map((conversation) => {
              const { session, role } = conversation;
              return (
                <li key={conversation.key}>
                  <button
                    type="button"
                    className="ap-chat-list-entry"
                    aria-current={conversation.key === selectedKey}
                    data-ended={session.state === 'ended'}
                    onClick={() => onSelect(conversation.key)}
                  >
                    <SessionGlyph role={role} session={session} />
                    <span className="ap-chat-list-text">
                      <span className="ap-chat-list-name ellipsis">
                        {conversation.projectName} · {conversation.isSendOnly ? OrchestratorSessionUtil.nameOf(session, role) : ROLE_WORDS[role]}
                      </span>
                      <span className="muted ap-chat-list-status ellipsis">{ChatConversationListUtil.statusLineOf(conversation)}</span>
                    </span>
                    {session.state !== 'ended' && session.pendingQuestions.length > 0 ? <span className="ap-question-marker" data-state="in-review">question</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
    </nav>
  );
}
