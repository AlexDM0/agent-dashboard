import { type KeyboardEvent, useId, useState } from 'react';
import { sendOrchestratorChat }                from './OrchestratorSessionDelivery.ts';
import { useSessionRequest }                   from './UseSessionRequest.ts';

interface ChatBoxProperties {
  trackerId:   string;
  sessionId:   string;
  sessionName: string;
  hasEnded:    boolean;
}

/** Enter sends, Shift+Enter is a newline; the text stays put on a refusal so nothing typed is lost. */
export function ChatBox({
  trackerId, sessionId, sessionName, hasEnded
}: ChatBoxProperties) {
  const [text, setText] = useState('');
  const { isSending, refusal, send } = useSessionRequest();
  const refusalId = useId();
  const isDisabled = isSending || hasEnded;

  async function sendText(): Promise<void> {
    if (isDisabled || text.trim() === '') return;
    const wasSent = await send(() => sendOrchestratorChat(trackerId, { text, sessionId }));
    if (wasSent) setText('');
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendText();
  }

  return (
    <div className="ap-chat">
      <textarea
        className="ap-chat-input"
        rows={2}
        value={text}
        placeholder={hasEnded ? 'This session has ended' : 'Message the orchestrator (Enter sends)'}
        aria-label={`Message ${sessionName}`}
        disabled={isDisabled}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={sendOnEnter}
        {...(refusal === null ? {} : { 'aria-describedby': refusalId })}
      />
      <button type="button" className="ap-control" disabled={isDisabled || text.trim() === ''} onClick={() => void sendText()}>
        {isSending ? 'Sending…' : 'Send'}
      </button>
      {refusal === null ? null : <span id={refusalId} className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </div>
  );
}
