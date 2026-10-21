import { DASHBOARD_ENDPOINTS } from '../constants/DashboardEndpoints.ts';

export type ConcurrencyRequestVerdict = { kind: 'accepted' } | { kind: 'refused'; reason: string };

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

export function concurrencyPathOf(trackerId: string): string {
  return `${DASHBOARD_ENDPOINTS.PROJECTS_API_PATH}/${encodeURIComponent(trackerId)}${DASHBOARD_ENDPOINTS.CONCURRENCY_PATH_SUFFIX}`;
}

/** Asks the server to set a project's limit; the new limit is shown only when a snapshot carries it. */
export async function requestConcurrencyLimit(
  trackerId: string,
  limit: number,
  sendRequest: RequestSender = (path, init) => fetch(path, init)
): Promise<ConcurrencyRequestVerdict> {
  try {
    const response = await sendRequest(concurrencyPathOf(trackerId), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ limit }),
    });
    if (response.ok) return { kind: 'accepted' };
    const responseText = (await response.text().catch(() => '')).trim();
    return { kind: 'refused', reason: responseText === '' ? `Refused with status ${response.status}` : responseText };
  } catch {
    return { kind: 'refused', reason: 'Could not reach the dashboard server' };
  }
}
