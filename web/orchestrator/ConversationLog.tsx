import { useEffect, useRef }                       from 'react';
import type { ChatMessage, ChatRole, SessionRole } from '../../src/shared/DashboardContract.ts';
import { ConversationItemUtil }                    from './ConversationItemUtil.ts';
import { MarkdownText }                            from './MarkdownText.tsx';
import { ToolCallGroup }                           from './ToolCallGroup.tsx';

interface ConversationLogProperties {
  /** Whose conversation it is, so the assistant's turns carry that role's word. */
  role:     SessionRole;
  messages: ChatMessage[];
}

const ROLE_WORD: Record<Exclude<ChatRole, 'assistant'>, string> = { user: 'You', tool: 'Tool', system: 'System' };
const ASSISTANT_WORD: Record<SessionRole, string> = { 'orchestrator': 'Orchestrator', 'product-owner': 'Product owner' };

/** Every agent-written text here is a React text node or Markdown without raw HTML: nothing is read as markup. */
export function ConversationLog({ role, messages }: ConversationLogProperties) {
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
      {ConversationItemUtil.itemsOf(messages).map((item) => (item.kind === 'tool-calls'
        ? <ToolCallGroup key={item.key} calls={item.calls} />
        : (
          <li key={item.key} className="ap-turn" data-role={item.message.role}>
            <span className="ap-turn-role">{item.message.role === 'assistant' ? ASSISTANT_WORD[role] : ROLE_WORD[item.message.role]}</span>
            <MarkdownText text={item.message.text} />
          </li>
        )))}
    </ol>
  );
}
