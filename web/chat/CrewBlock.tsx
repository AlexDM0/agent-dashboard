import { SessionGlyph }                                    from '../orchestrator/SessionGlyph.tsx';
import { useSessionRequest }                               from '../orchestrator/UseSessionRequest.ts';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { startProductOwnerIn }                             from './ChatOverlayRequests.ts';

interface CrewBlockProperties {
  trackerId:            string;
  projectName:          string;
  /** The project's live orchestrator and product owner sessions. */
  crew:                 ChatConversation[];
  selectedKey:          string;
  canStartProductOwner: boolean;
  onSelect:             (key: string) => void;
}

/** The project's crew, each selectable, and "+ New ticket", which starts a product owner that files what it is told. */
export function CrewBlock({
  trackerId, projectName, crew, selectedKey, canStartProductOwner, onSelect
}: CrewBlockProperties) {
  const { isSending, refusal, send } = useSessionRequest();

  async function startProductOwner(): Promise<void> {
    const wasStarted = await send(() => startProductOwnerIn(trackerId, 'file'));
    if (wasStarted) onSelect(ChatConversationListUtil.dashboardKeyOf('product-owner', trackerId));
  }

  return (
    <section className="ap-chat-context-section" aria-label={`Crew of ${projectName}`}>
      <h3 className="ap-chat-context-title">Crew of {projectName}</h3>
      <ul className="ap-chat-list">
        {crew.map((conversation) => (
          <li key={conversation.key}>
            <button type="button" className="ap-chat-list-entry" aria-current={conversation.key === selectedKey} onClick={() => onSelect(conversation.key)}>
              <SessionGlyph role={conversation.role} session={conversation.session} />
              <span className="ap-chat-list-text">
                <span className="ap-chat-list-name ellipsis">{ChatConversationListUtil.titleOf(conversation)}</span>
                <span className="muted ap-chat-list-status ellipsis">{ChatConversationListUtil.statusLineOf(conversation)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="ap-chat-start-product-owner">
        <button
          type="button"
          className="ap-control is-quiet ap-chat-add"
          disabled={!canStartProductOwner || isSending}
          title={canStartProductOwner ? 'Start a product owner that files tickets' : 'A product owner already runs for this project'}
          aria-label={`New ticket: start a product owner for ${projectName}`}
          onClick={() => void startProductOwner()}
        >
          + New ticket
        </button>
        {isSending ? <span className="muted ap-caption" role="status">Starting…</span> : null}
        {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
      </div>
    </section>
  );
}
