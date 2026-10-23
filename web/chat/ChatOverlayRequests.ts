import { sendSessionChat, startOrchestrator, startProductOwner } from '../orchestrator/OrchestratorSessionDelivery.ts';
import type { OrchestratorRequestVerdict }                       from '../shell/OrchestratorRequestDelivery.ts';
import type { ChatConversation }                                 from './ChatConversationListUtil.ts';

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

/** The composer's one-click prompts, each sent as exactly its text. */
export const QUICK_PROMPTS = ['Challenge this', 'What am I missing?', 'Summarise the table', 'Wrap up into tickets'] as const;

const defaultSender: RequestSender = (path, init) => fetch(path, init);

/** "New spar": a product owner that files nothing until the user wraps up. */
export function startSparringProductOwner(trackerId: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return startProductOwner(trackerId, { mode: 'spar' }, sendRequest);
}

/** An orchestrator that waits for the user's go, as the drawer's Start orchestrator starts one. */
export function startWaitingOrchestrator(trackerId: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return startOrchestrator(trackerId, { startBuilding: false }, sendRequest);
}

/** A message to the conversation's own session, through its role's messages route. */
export function sendToConversation(conversation: ChatConversation, text: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return sendSessionChat(conversation.role, conversation.trackerId, { text, sessionId: conversation.session.sessionId }, sendRequest);
}
