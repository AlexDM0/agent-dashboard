import { DASHBOARD_ENDPOINTS } from '../constants/DashboardEndpoints.ts';

export type DispatcherStopVerdict = { kind: 'stopped' } | { kind: 'refused'; reason: string };

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

export function dispatcherPathOf(trackerId: string): string {
  return `${DASHBOARD_ENDPOINTS.PROJECTS_API_PATH}/${encodeURIComponent(trackerId)}${DASHBOARD_ENDPOINTS.DISPATCHER_PATH_SUFFIX}`;
}

/** Asks the server to store the stop; the dispatcher in flight reads it as each agent returns. */
export async function requestDispatcherStop(
  trackerId: string,
  sendRequest: RequestSender = (path, init) => fetch(path, init)
): Promise<DispatcherStopVerdict> {
  try {
    const response = await sendRequest(dispatcherPathOf(trackerId), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ state: 'stopped' }),
    });
    if (response.ok) return { kind: 'stopped' };
    const responseText = (await response.text().catch(() => '')).trim();
    return { kind: 'refused', reason: responseText === '' ? `Refused with status ${response.status}` : responseText };
  } catch {
    return { kind: 'refused', reason: 'Could not reach the dashboard server' };
  }
}
