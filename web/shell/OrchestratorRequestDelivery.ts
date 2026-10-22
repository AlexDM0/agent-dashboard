import type { OrchestratorRequest } from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS }      from '../constants/DashboardEndpoints.ts';

export type OrchestratorRequestVerdict = { kind: 'sent' } | { kind: 'refused'; reason: string };

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

export function orchestratorRequestsPathOf(trackerId: string): string {
  return `${DASHBOARD_ENDPOINTS.PROJECTS_API_PATH}/${encodeURIComponent(trackerId)}${DASHBOARD_ENDPOINTS.ORCHESTRATOR_REQUESTS_PATH_SUFFIX}`;
}

/** Hands a request to the board's live orchestrator session through the server; the board itself changes only if it acts. */
export async function deliverOrchestratorRequest(
  trackerId: string,
  orchestratorRequest: OrchestratorRequest,
  sendRequest: RequestSender = (path, init) => fetch(path, init)
): Promise<OrchestratorRequestVerdict> {
  try {
    const response = await sendRequest(orchestratorRequestsPathOf(trackerId), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(orchestratorRequest),
    });
    if (response.ok) return { kind: 'sent' };
    const responseText = (await response.text().catch(() => '')).trim();
    return { kind: 'refused', reason: responseText === '' ? `Refused with status ${response.status}` : responseText };
  } catch {
    return { kind: 'refused', reason: 'Could not reach the dashboard server' };
  }
}
