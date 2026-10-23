import { DASHBOARD_ENDPOINTS } from '../constants/DashboardEndpoints.ts';

export type ServerRestartVerdict = { kind: 'restarting' } | { kind: 'refused'; reason: string };

type RequestSender = (path: string, init: RequestInit) => Promise<Response>;

/** Asks the server to hand its port to a fresh server; the event stream then reconnects by itself. */
export async function requestServerRestart(sendRequest: RequestSender = (path, init) => fetch(path, init)): Promise<ServerRestartVerdict> {
  try {
    const response = await sendRequest(DASHBOARD_ENDPOINTS.RESTART_PATH, {
      method:  'POST',
      headers: { [DASHBOARD_ENDPOINTS.RESTART_HEADER_NAME]: DASHBOARD_ENDPOINTS.RESTART_HEADER_VALUE },
    });
    if (response.ok) return { kind: 'restarting' };
    const responseText = (await response.text().catch(() => '')).trim();
    return { kind: 'refused', reason: responseText === '' ? `Refused with status ${response.status}` : responseText };
  } catch {
    return { kind: 'refused', reason: 'Could not reach the dashboard server' };
  }
}
