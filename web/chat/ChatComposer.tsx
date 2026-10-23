import { type KeyboardEvent, useId, useState }             from 'react';
import type { PendingQuestion }                            from '../../src/shared/DashboardContract.ts';
import { useSessionRequest }                               from '../orchestrator/UseSessionRequest.ts';
import { type QuestionDraft, QuestionAnswerUtil }          from '../questions/QuestionAnswerUtil.ts';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { answerConversation, sendToConversation }          from './ChatOverlayRequests.ts';

/** The question the composer answers while it waits, with what the user has chosen on its card so far. */
export interface ComposerQuestion {
  pendingQuestion: PendingQuestion;
  drafts:          QuestionDraft[];
}

interface ChatComposerProperties {
  conversation: ChatConversation;
  question:     ComposerQuestion | null;
  onAnswered:   (requestId: string) => void;
}

/**
 * Enter sends, Shift+Enter is a newline; the text stays put on a refusal. While a question waits the text goes out as
 * its "Other" answer, never as a message.
 */
export function ChatComposer({ conversation, question, onAnswered }: ChatComposerProperties) {
  const [text, setText] = useState('');
  const { isSending, refusal, send } = useSessionRequest();
  const inputId = useId();
  const refusalId = useId();
  const hasEnded = conversation.session.state === 'ended';
  const isStopping = conversation.session.state === 'stopping';
  const isDisabled = isSending || hasEnded || isStopping;
  const roleWord = ChatConversationListUtil.roleWordOf(conversation.role);
  const label = question === null
    ? `Message the ${roleWord} of ${conversation.projectName}`
    : `Answer the ${roleWord}'s question as "Other"`;
  const closedText = hasEnded ? 'This session has ended' : isStopping ? 'Stopping…' : null;

  async function sendText(): Promise<void> {
    if (isDisabled || text.trim() === '') return;
    if (question === null) {
      const wasSent = await send(() => sendToConversation(conversation, text));
      if (wasSent) setText('');
      return;
    }
    const answerRequest = QuestionAnswerUtil.otherAnswerRequestOf(question.pendingQuestion, question.drafts, text);
    if (answerRequest === null) return;
    const wasSent = await send(() => answerConversation(conversation, answerRequest));
    if (!wasSent) return;
    setText('');
    onAnswered(answerRequest.requestId);
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendText();
  }

  return (
    <div className="ap-chat-composer-box">
      <label className="muted ap-caption ap-chat-composer-label" htmlFor={inputId}>{closedText ?? label}</label>
      <div className="ap-chat">
        <textarea
          id={inputId}
          className="ap-chat-input"
          rows={2}
          value={text}
          placeholder={closedText ?? `${label} (Enter sends)`}
          disabled={isDisabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendOnEnter}
          {...(refusal === null ? {} : { 'aria-describedby': refusalId })}
        />
        <button type="button" className="ap-control" disabled={isDisabled || text.trim() === ''} onClick={() => void sendText()}>
          {isSending ? 'Sending…' : question === null ? 'Send' : 'Answer'}
        </button>
        {refusal === null ? null : <span id={refusalId} className="ap-stepper-refusal" role="alert">{refusal}</span>}
      </div>
    </div>
  );
}
