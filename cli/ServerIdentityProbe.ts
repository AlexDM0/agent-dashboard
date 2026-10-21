import type { ServerIdentity } from '../src/shared/DashboardContract.ts';
import { DASHBOARD_PROTOCOL }  from '../src/shared/constants/DashboardProtocol.ts';
import { COMMAND_LINE_LIMITS } from './constants/CommandLineLimits.ts';

export type IdentityProbeVerdict =
  | { kind: 'dashboard'; identity: ServerIdentity }
  | { kind: 'something-else' }
  | { kind: 'no-answer' };

function identityFrom(document: unknown): ServerIdentity | null {
  if (typeof document !== 'object' || document === null) return null;
  const { application, version, pid: processId } = document as Record<string, unknown>;
  if (application !== 'agent-dashboard' || typeof version !== 'string' || typeof processId !== 'number') return null;
  return { application, version, pid: processId };
}

/** Anything that answers HTTP but not with the dashboard's identity is something else holding the port; no answer at all is nothing there. */
export async function probeServerIdentity(serverUrl: string): Promise<IdentityProbeVerdict> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${DASHBOARD_PROTOCOL.IDENTITY_PATH}`, { signal: AbortSignal.timeout(COMMAND_LINE_LIMITS.IDENTITY_PROBE_TIMEOUT_MILLISECONDS) });
  } catch {
    return { kind: 'no-answer' };
  }
  try {
    const identity = response.ok ? identityFrom(await response.json()) : null;
    return identity === null ? { kind: 'something-else' } : { kind: 'dashboard', identity };
  } catch {
    return { kind: 'something-else' };
  }
}

export function localServerUrlOf(port: number): string {
  return `http://127.0.0.1:${port}`;
}
