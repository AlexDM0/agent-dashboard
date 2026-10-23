import { useContext, useEffect, useState } from 'react';
import type { ChatMessage, SessionRole }   from '../../src/shared/DashboardContract.ts';
import { DashboardEventHubContext }        from '../shell/DashboardEventHubContext.ts';

/**
 * The dashboard-owned conversation of a project's role, subscribed on the page's one event stream for as long as the
 * caller shows it: the history on every (re)connect replaces what is held, so a reconnect never doubles a message. The
 * session itself is taken from the snapshot, which carries it too.
 */
export function useOrchestratorConversation(role: SessionRole, trackerId: string): ChatMessage[] {
  const eventHub = useContext(DashboardEventHubContext);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => eventHub?.subscribeToConversation(role, trackerId, setMessages), [eventHub, role, trackerId]);

  return messages;
}
