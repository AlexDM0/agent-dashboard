import { useState }                          from 'react';
import type { BoardSummary, ChatMessage }    from '../../src/shared/DashboardContract.ts';
import { ChatBox }                           from '../orchestrator/ChatBox.tsx';
import { ContextMeter }                      from '../orchestrator/ContextMeter.tsx';
import { ConversationLog }                   from '../orchestrator/ConversationLog.tsx';
import { stopSession }                       from '../orchestrator/OrchestratorSessionDelivery.ts';
import { OrchestratorSessionUtil }           from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                      from '../orchestrator/SessionGlyph.tsx';
import { SessionStateBadge }                 from '../orchestrator/SessionStateBadge.tsx';
import { useOrchestratorConversation }       from '../orchestrator/UseOrchestratorConversation.ts';
import { useSessionRequest }                 from '../orchestrator/UseSessionRequest.ts';
import { PendingQuestionForm }               from '../questions/PendingQuestionForm.tsx';
import type { ChatConversation }             from './ChatConversationListUtil.ts';
import { QUICK_PROMPTS, sendToConversation } from './ChatOverlayRequests.ts';
import { ConversationHeadingUtil }           from './ConversationHeadingUtil.ts';
import { OnTheTable }                        from './OnTheTable.tsx';
import { SparTableUtil }                     from './SparTableUtil.ts';

interface SelectedConversationProperties {
  conversation: ChatConversation;
  board:        BoardSummary | null;
  onMinimise:   () => void;
  onDock:       () => void;
  onClose:      () => void;
}

interface ConversationColumnsProperties extends SelectedConversationProperties {
  messages: ChatMessage[];
}

function QuickPrompts({ conversation }: { conversation: ChatConversation }) {
  const { isSending, refusal, send } = useSessionRequest();
  const hasEnded = conversation.session.state === 'ended';
  return (
    <div className="ap-chat-quick-prompts" role="group" aria-label="Quick prompts">
      {QUICK_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="ap-control ap-chat-quick-prompt"
          disabled={isSending || hasEnded}
          onClick={() => void send(() => sendToConversation(conversation, prompt))}
        >
          {prompt}
        </button>
      ))}
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </div>
  );
}

function EndSessionControl({ conversation }: { conversation: ChatConversation }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const { isSending, refusal, send } = useSessionRequest();
  if (conversation.isSendOnly || conversation.session.state === 'ended') return null;
  if (!isConfirming) {
    return <button type="button" className="ap-control is-quiet" onClick={() => setIsConfirming(true)}>End session</button>;
  }
  return (
    <span className="ap-chat-end-confirm" role="group" aria-label="End this session?">
      <span className="ap-caption">End this session?</span>
      <button
        type="button"
        className="ap-control"
        disabled={isSending}
        onClick={() => void send(() => stopSession(conversation.role, conversation.trackerId)).then((wasEnded) => wasEnded && setIsConfirming(false))}
      >
        {isSending ? 'Ending…' : 'End'}
      </button>
      <button type="button" className="ap-control is-quiet" onClick={() => setIsConfirming(false)}>Cancel</button>
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </span>
  );
}

function ConversationColumns({
  conversation, board, messages, onMinimise, onDock, onClose
}: ConversationColumnsProperties) {
  const { session, role, trackerId } = conversation;
  const sessionName = OrchestratorSessionUtil.nameOf(session, role);
  const title = ConversationHeadingUtil.titleOf(messages, !conversation.isSendOnly) ?? sessionName;
  const isSparring = role === 'product-owner' && ConversationHeadingUtil.isSparring(messages);
  const hasEnded = session.state === 'ended';
  return (
    <>
      <section className="ap-chat-column ap-chat-conversation-column" aria-label={`Conversation: ${title}`}>
        <header className="ap-chat-conversation-head">
          <div className="ap-chat-conversation-identity">
            <SessionGlyph role={role} session={session} />
            <h2 className="ap-chat-conversation-title ellipsis" title={title}>{title}</h2>
            {isSparring ? <span className="ap-pill" data-state="in-review">sparring · files nothing</span> : null}
            <SessionStateBadge role={role} session={session} />
          </div>
          <div className="ap-chat-conversation-meta">
            <span className="muted ap-caption">{conversation.projectName} · {sessionName}</span>
            <ContextMeter context={session.context} compact />
          </div>
          <div className="ap-chat-conversation-actions">
            <button type="button" className="ap-control is-quiet" onClick={onMinimise}>Minimise</button>
            <button type="button" className="ap-control is-quiet" onClick={onDock}>Dock beside the board</button>
            <EndSessionControl key={conversation.key} conversation={conversation} />
            <button type="button" className="ap-control is-quiet ap-icon-control ap-chat-close" aria-label="Close the chat" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>
        <div className="ap-chat-conversation-body">
          {conversation.isSendOnly
            ? <p className="muted ap-caption">This desktop app session&apos;s conversation shows in its own app; a message sent here reaches it as a peer&apos;s message.</p>
            : null}
          {conversation.isSendOnly || hasEnded
            ? null
            : session.pendingQuestions.map((pendingQuestion) => (
              <PendingQuestionForm key={pendingQuestion.requestId} role={role} trackerId={trackerId} pendingQuestion={pendingQuestion} />
            ))}
          {conversation.isSendOnly ? null : <ConversationLog role={role} messages={SparTableUtil.messagesWithoutTablesOf(messages)} />}
        </div>
        {hasEnded
          ? null
          : (
            <footer className="ap-chat-composer">
              <QuickPrompts key={conversation.key} conversation={conversation} />
              <ChatBox key={conversation.key} role={role} trackerId={trackerId} sessionId={session.sessionId} sessionName={sessionName} hasEnded={hasEnded} />
            </footer>
          )}
      </section>
      <OnTheTable table={SparTableUtil.latestTableOf(messages)} board={board} />
    </>
  );
}

function TailedConversation(properties: SelectedConversationProperties) {
  const messages = useOrchestratorConversation(properties.conversation.role, properties.conversation.trackerId);
  return <ConversationColumns {...properties} messages={messages} />;
}

/** A dashboard-owned session is read from its own event stream; a watched desktop one's transcript is not tailed. */
export function SelectedConversation(properties: SelectedConversationProperties) {
  return properties.conversation.isSendOnly
    ? <ConversationColumns {...properties} messages={[]} />
    : <TailedConversation key={properties.conversation.key} {...properties} />;
}
