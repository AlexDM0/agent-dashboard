import { type KeyboardEvent, useId, useState } from 'react';
import type { OrchestratorState, SessionRole } from '../../src/shared/DashboardContract.ts';
import { sendSessionChat }                     from './OrchestratorSessionDelivery.ts';
import { useSessionRequest }                   from './UseSessionRequest.ts';

interface ChatBoxProperties {
  role:        SessionRole;
  trackerId:   string;
  sessionId:   string;
  sessionName: string;
  /** The state the session's card shows: a stopping or ended one takes no message. */
  shownState:  OrchestratorState;
}

const PLACEHOLDERS: Record<SessionRole, string> = {
  'orchestrator':  'Message the orchestrator (Enter sends)',
  'product-owner': 'Message the product owner (Enter sends)',
};

function placeholderOf(shownState: OrchestratorState, role: SessionRole): string {
  if (shownState === 'ended') return 'This session has ended';
  return shownState === 'stopping' ? 'Stopping…' : PLACEHOLDERS[role];
}

/** Enter sends, Shift+Enter is a newline; the text stays put on a refusal so nothing typed is lost. */
export function ChatBox({
  role, trackerId, sessionId, sessionName, shownState
}: ChatBoxProperties) {
  const [text, setText] = useState('');
  const { isSending, refusal, send } = useSessionRequest();
  const refusalId = useId();
  const isDisabled = isSending || shownState === 'ended' || shownState === 'stopping';

  async function sendText(): Promise<void> {
    if (isDisabled || text.trim() === '') return;
    const wasSent = await send(() => sendSessionChat(role, trackerId, { text, sessionId }));
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
        placeholder={placeholderOf(shownState, role)}
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
