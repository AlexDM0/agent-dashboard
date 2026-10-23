import { useEffect, useState }           from 'react';
import type { ChatMessage, SessionRole } from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS }           from '../constants/DashboardEndpoints.ts';
import { WEB_LIMITS }                    from '../constants/WebLimits.ts';
import { sessionEventsPathOf }           from './OrchestratorSessionDelivery.ts';

/**
 * The dashboard-owned conversation of a project's role from its event stream: the history on every (re)connect
 * replaces what is held, so a reconnect never doubles a message; each new message is appended. The session itself is
 * taken from the snapshot, which carries it too.
 */
export function useOrchestratorConversation(role: SessionRole, trackerId: string): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    setMessages([]);
    const source = new EventSource(sessionEventsPathOf(role, trackerId));
    source.addEventListener(DASHBOARD_ENDPOINTS.ORCHESTRATOR_HISTORY_EVENT_NAME, (event) => {
      setMessages((JSON.parse(String(event.data)) as ChatMessage[]).slice(-WEB_LIMITS.MAXIMUM_SHOWN_CONVERSATION_MESSAGES));
    });
    source.addEventListener(DASHBOARD_ENDPOINTS.ORCHESTRATOR_MESSAGE_EVENT_NAME, (event) => {
      const message = JSON.parse(String(event.data)) as ChatMessage;
      setMessages((previous) => [...previous, message].slice(-WEB_LIMITS.MAXIMUM_SHOWN_CONVERSATION_MESSAGES));
    });
    return () => source.close();
  }, [role, trackerId]);

  return messages;
}
