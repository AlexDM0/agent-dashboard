import { useEffect, useRef }          from 'react';
import type { ChatMessage, ChatRole } from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }                 from '../constants/WebLimits.ts';

interface ConversationLogProperties {
  messages: ChatMessage[];
}

const ROLE_WORD: Record<ChatRole, string> = {
  user: 'You', assistant: 'Orchestrator', tool: 'Tool', system: 'System'
};

function ToolCallLine({ message }: { message: ChatMessage }) {
  const firstLine = message.text.split('\n', 1)[0] ?? '';
  const summary = firstLine.length > WEB_LIMITS.TOOL_CALL_SUMMARY_CHARACTERS ? `${firstLine.slice(0, WEB_LIMITS.TOOL_CALL_SUMMARY_CHARACTERS)}…` : firstLine;
  return (
    <li className="ap-turn" data-role="tool">
      <details>
        <summary className="mono ap-tool-summary">{summary}</summary>
        <pre className="mono ap-tool-text">{message.text}</pre>
      </details>
    </li>
  );
}

/** Every agent-written text here is a React text node: nothing the session writes is ever read as markup. */
export function ConversationLog({ messages }: ConversationLogProperties) {
  const listReference = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const list = listReference.current;
    if (list !== null) list.scrollTop = list.scrollHeight;
  }, [messages]);

  if (messages.length === 0) {
    return <p className="muted ap-conversation-empty">No conversation yet</p>;
  }
  return (
    <ol className="ap-conversation" ref={listReference} aria-label="Conversation" tabIndex={0}>
      {messages.map((message, index) => (message.role === 'tool'
        ? <ToolCallLine key={index} message={message} />
        : (
          <li key={index} className="ap-turn" data-role={message.role}>
            <span className="ap-turn-role">{ROLE_WORD[message.role]}</span>
            <p className="ap-turn-text">{message.text}</p>
          </li>
        )))}
    </ol>
  );
}
