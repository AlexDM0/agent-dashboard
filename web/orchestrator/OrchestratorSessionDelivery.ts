import type {
  LaunchToken,
  OrchestratorAnswerRequest,
  OrchestratorChatRequest,
  OrchestratorStartRequest,
  ProductOwnerStartRequest,
  SessionRole
} from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS }             from '../constants/DashboardEndpoints.ts';
import type { OrchestratorRequestVerdict } from '../shell/OrchestratorRequestDelivery.ts';

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

/** Each role's own routes, so a chat, an answer or a stop for one role can never reach the other's session. */
const ROLE_PATH_SUFFIXES: Record<SessionRole, { session: string; messages: string; answers: string; events: string }> = {
  'orchestrator': {
    session:  DASHBOARD_ENDPOINTS.ORCHESTRATOR_PATH_SUFFIX,
    messages: DASHBOARD_ENDPOINTS.ORCHESTRATOR_MESSAGES_PATH_SUFFIX,
    answers:  DASHBOARD_ENDPOINTS.ORCHESTRATOR_ANSWERS_PATH_SUFFIX,
    events:   DASHBOARD_ENDPOINTS.ORCHESTRATOR_EVENTS_PATH_SUFFIX,
  },
  'product-owner': {
    session:  DASHBOARD_ENDPOINTS.PRODUCT_OWNER_PATH_SUFFIX,
    messages: DASHBOARD_ENDPOINTS.PRODUCT_OWNER_MESSAGES_PATH_SUFFIX,
    answers:  DASHBOARD_ENDPOINTS.PRODUCT_OWNER_ANSWERS_PATH_SUFFIX,
    events:   DASHBOARD_ENDPOINTS.PRODUCT_OWNER_EVENTS_PATH_SUFFIX,
  },
};

const UNREACHABLE_REASON = 'Could not reach the dashboard server';

function projectPathOf(trackerId: string, suffix: string): string {
  return `${DASHBOARD_ENDPOINTS.PROJECTS_API_PATH}/${encodeURIComponent(trackerId)}${suffix}`;
}

async function refusalOf(response: Response): Promise<OrchestratorRequestVerdict> {
  const responseText = (await response.text().catch(() => '')).trim();
  return { kind: 'refused', reason: responseText === '' ? `Refused with status ${String(response.status)}` : responseText };
}

/**
 * Every start, stop, chat, answer and handoff carries the server's launch token, asked for afresh each time so a restarted
 * server's new token is never missed; any refusal, a 403 included, comes back with the server's own text.
 */
async function deliverWithLaunchToken(sendRequest: RequestSender, path: string, method: 'POST' | 'DELETE', body: unknown): Promise<OrchestratorRequestVerdict> {
  try {
    const tokenResponse = await sendRequest(DASHBOARD_ENDPOINTS.LAUNCH_TOKEN_PATH, { method: 'GET' });
    if (!tokenResponse.ok) return await refusalOf(tokenResponse);
    const { token } = await tokenResponse.json() as LaunchToken;
    const response = await sendRequest(path, {
      method,
      headers: {
        [DASHBOARD_ENDPOINTS.LAUNCH_TOKEN_HEADER_NAME]: token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.ok ? { kind: 'sent' } : await refusalOf(response);
  } catch {
    return { kind: 'refused', reason: UNREACHABLE_REASON };
  }
}

const defaultSender: RequestSender = (path, init) => fetch(path, init);

export function startOrchestrator(trackerId: string, startRequest: OrchestratorStartRequest, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, DASHBOARD_ENDPOINTS.ORCHESTRATOR_PATH_SUFFIX), 'POST', startRequest);
}

export function startProductOwner(trackerId: string, startRequest: ProductOwnerStartRequest, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, DASHBOARD_ENDPOINTS.PRODUCT_OWNER_PATH_SUFFIX), 'POST', startRequest);
}

export function stopSession(role: SessionRole, trackerId: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, ROLE_PATH_SUFFIXES[role].session), 'DELETE', undefined);
}

export function sendSessionChat(role: SessionRole, trackerId: string, chatRequest: OrchestratorChatRequest, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, ROLE_PATH_SUFFIXES[role].messages), 'POST', chatRequest);
}

export function sendSessionAnswer(
  role: SessionRole,
  trackerId: string,
  answerRequest: OrchestratorAnswerRequest,
  sendRequest = defaultSender
): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, ROLE_PATH_SUFFIXES[role].answers), 'POST', answerRequest);
}

/** Answers only once the fresh session runs or the handoff failed, so it may take as long as the session's note does. */
export function handOffOrchestrator(trackerId: string, sendRequest = defaultSender): Promise<OrchestratorRequestVerdict> {
  return deliverWithLaunchToken(sendRequest, projectPathOf(trackerId, DASHBOARD_ENDPOINTS.ORCHESTRATOR_HANDOFF_PATH_SUFFIX), 'POST', undefined);
}

export function sessionEventsPathOf(role: SessionRole, trackerId: string): string {
  return projectPathOf(trackerId, ROLE_PATH_SUFFIXES[role].events);
}
