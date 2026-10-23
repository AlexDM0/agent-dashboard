import type { OrchestratorAnswerRequest, ProductOwnerMode }      from '../../src/shared/DashboardContract.ts';
import { sendSessionAnswer, sendSessionChat, startProductOwner } from '../orchestrator/OrchestratorSessionDelivery.ts';
import type { OrchestratorRequestVerdict }                       from '../shell/OrchestratorRequestDelivery.ts';
import type { ChatConversation }                                 from './ChatConversationListUtil.ts';

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

const defaultSender: RequestSender = (path, init) => fetch(path, init);

/** "+ Product owner": "File tickets" starts one in `file` mode, "Spar first" in `spar` mode, which files nothing until the user wraps up. */
export function startProductOwnerIn(trackerId: string, mode: ProductOwnerMode, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return startProductOwner(trackerId, { mode }, sendRequest);
}

/** A message to the conversation's own session, through its role's messages route. */
export function sendToConversation(conversation: ChatConversation, text: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return sendSessionChat(conversation.role, conversation.trackerId, { text, sessionId: conversation.session.sessionId }, sendRequest);
}

/** The answer to the conversation's pending question, through its role's answers route. */
export function answerConversation(conversation: ChatConversation, answerRequest: OrchestratorAnswerRequest, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return sendSessionAnswer(conversation.role, conversation.trackerId, answerRequest, sendRequest);
}
