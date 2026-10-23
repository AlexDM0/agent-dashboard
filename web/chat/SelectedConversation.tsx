import { useEffect, useState }                             from 'react';
import type { BoardSummary, ChatMessage }                  from '../../src/shared/DashboardContract.ts';
import { ContextMeter }                                    from '../orchestrator/ContextMeter.tsx';
import { ConversationLog }                                 from '../orchestrator/ConversationLog.tsx';
import { OrchestratorMenu }                                from '../orchestrator/OrchestratorMenu.tsx';
import { SessionGlyph }                                    from '../orchestrator/SessionGlyph.tsx';
import { SessionStateBadge }                               from '../orchestrator/SessionStateBadge.tsx';
import { useOrchestratorConversation }                     from '../orchestrator/UseOrchestratorConversation.ts';
import { useSessionRequest }                               from '../orchestrator/UseSessionRequest.ts';
import { type QuestionDraft, QuestionAnswerUtil }          from '../questions/QuestionAnswerUtil.ts';
import { ChatComposer }                                    from './ChatComposer.tsx';
import { ChatContextColumn }                               from './ChatContextColumn.tsx';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { ConversationHeadingUtil }                         from './ConversationHeadingUtil.ts';
import { DockedQuestionCard }                              from './DockedQuestionCard.tsx';
import { SparTableUtil }                                   from './SparTableUtil.ts';

interface SelectedConversationProperties {
  conversation:       ChatConversation;
  board:              BoardSummary | null;
  now:                number;
  /** Text put into the composer from outside, and a serial that changes with each new seed. */
  composerSeedText:   string;
  composerSeedSerial: number;
  onCollapse:         () => void;
  onOpenBoard:        () => void;
  onClose:            () => void;
}

interface ConversationColumnsProperties extends SelectedConversationProperties {
  messages: ChatMessage[];
}

function SessionMenu({ conversation }: { conversation: ChatConversation }) {
  const refreshRequest = useSessionRequest();
  const stopRequest = useSessionRequest();
  if (conversation.isSendOnly || conversation.session.state === 'ended') return null;
  const refusal = refreshRequest.refusal ?? stopRequest.refusal;
  return (
    <>
      <OrchestratorMenu role={conversation.role} trackerId={conversation.trackerId} session={conversation.session} refreshRequest={refreshRequest} stopRequest={stopRequest} />
      {refreshRequest.isSending || stopRequest.isSending ? <span className="muted ap-caption" role="status">Sending…</span> : null}
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </>
  );
}

function ConversationColumns({
  conversation, board, now, messages, composerSeedText, composerSeedSerial, onCollapse, onOpenBoard, onClose
}: ConversationColumnsProperties) {
  const { session, role } = conversation;
  const [draftsByRequest, setDraftsByRequest] = useState<Record<string, QuestionDraft[]>>({});
  const [answeredRequestIds, setAnsweredRequestIds] = useState<string[]>([]);
  const roleTitle = ChatConversationListUtil.titleOf(conversation);
  const firstMessageTitle = conversation.isSendOnly ? null : ConversationHeadingUtil.titleOf(messages, true);
  const isSparring = role === 'product-owner' && ConversationHeadingUtil.isSparring(messages);
  const hasEnded = session.state === 'ended';
  const waitingQuestions = conversation.isSendOnly || hasEnded ? [] : session.pendingQuestions.filter((pendingQuestion) => !answeredRequestIds.includes(pendingQuestion.requestId));
  const [pendingQuestion] = waitingQuestions;
  const drafts = pendingQuestion === undefined
    ? []
    : Object.hasOwn(draftsByRequest, pendingQuestion.requestId) ? draftsByRequest[pendingQuestion.requestId] ?? [] : QuestionAnswerUtil.emptyDraftsOf(pendingQuestion);
  const markAnswered = (requestId: string): void => setAnsweredRequestIds((previous) => [...previous, requestId]);
  const pendingRequestIds = session.pendingQuestions.map((candidate) => candidate.requestId).join('\n');

  // An answered request is hidden only until a snapshot drops it, so a request asked again later shows again.
  useEffect(() => {
    const stillPending = pendingRequestIds.split('\n');
    setAnsweredRequestIds((previous) => {
      const kept = previous.filter((requestId) => stillPending.includes(requestId));
      return kept.length === previous.length ? previous : kept;
    });
  }, [pendingRequestIds]);

  return (
    <>
      <section className="ap-chat-column ap-chat-conversation-column" aria-label={`Conversation: ${roleTitle} of ${conversation.projectName}`}>
        <header className="ap-chat-conversation-head">
          <div className="ap-chat-conversation-identity">
            <SessionGlyph role={role} session={session} />
            <h2 className="ap-chat-conversation-title ellipsis">{roleTitle} <span className="muted">· {conversation.projectName}</span></h2>
            {isSparring ? <span className="ap-pill" data-state="in-review">sparring · files nothing</span> : null}
            <SessionStateBadge role={role} session={session} />
            <span className="ap-pill">{conversation.isSendOnly ? 'desktop · send-only' : 'hosted'}</span>
          </div>
          <div className="ap-chat-conversation-meta">
            {firstMessageTitle === null ? null : <span className="muted ap-caption ellipsis" title={firstMessageTitle}>{firstMessageTitle}</span>}
            <ContextMeter context={session.context} compact />
          </div>
          <div className="ap-chat-conversation-actions">
            <button type="button" className="ap-control is-quiet" onClick={onCollapse}>Collapse into the board&apos;s drawer</button>
            <button type="button" className="ap-control is-quiet" onClick={onOpenBoard}>Open board</button>
            <SessionMenu key={conversation.key} conversation={conversation} />
            <button type="button" className="ap-control is-quiet ap-icon-control ap-chat-close" aria-label="Close the chat" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>
        <div className="ap-chat-conversation-body">
          {conversation.isSendOnly
            ? <p className="muted ap-caption">This desktop app session&apos;s conversation shows in its own app; a message sent here reaches it as a peer&apos;s message.</p>
            : <ConversationLog role={role} messages={SparTableUtil.messagesWithoutTablesOf(messages)} />}
        </div>
        {pendingQuestion === undefined
          ? null
          : (
            <DockedQuestionCard
              key={pendingQuestion.requestId}
              conversation={conversation}
              pendingQuestion={pendingQuestion}
              laterCount={waitingQuestions.length - 1}
              drafts={drafts}
              now={now}
              onDraftsChange={(nextDrafts) => setDraftsByRequest((previous) => ({ ...previous, [pendingQuestion.requestId]: nextDrafts }))}
              onAnswered={markAnswered}
            />
          )}
        {hasEnded
          ? null
          : (
            <footer className="ap-chat-composer">
              <ChatComposer
                key={`${conversation.key}:${String(composerSeedSerial)}`}
                conversation={conversation}
                question={pendingQuestion === undefined ? null : { pendingQuestion, drafts }}
                initialText={composerSeedText}
                onAnswered={markAnswered}
              />
            </footer>
          )}
      </section>
      <ChatContextColumn conversation={conversation} board={board} messages={messages} now={now} />
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
    ? <ConversationColumns key={properties.conversation.key} {...properties} messages={[]} />
    : <TailedConversation key={properties.conversation.key} {...properties} />;
}
