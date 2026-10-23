import { DASHBOARD_LIMITS }    from '../../src/shared/constants/DashboardLimits.ts';
import { probeServerIdentity } from '../ServerIdentityProbe.ts';
import { waitMilliseconds }    from '../WaitMilliseconds.ts';
import { COMMAND_LINE_LIMITS } from '../constants/CommandLineLimits.ts';
import type { DetachedServer } from './StartDetachedServer.ts';

export type DetachedServerAnswer =
  | { kind: 'answered' }
  | { kind: 'exited'; exitCode: number }
  | { kind: 'timed-out'; timeoutMilliseconds: number };

/** Polls the url until a dashboard answers there, the detached server exits, or the start timeout passes. */
export async function detachedServerAnswerOf(url: string, server: DetachedServer): Promise<DetachedServerAnswer> {
  const timeoutMilliseconds = DASHBOARD_LIMITS.SERVER_START_TIMEOUT_MILLISECONDS;
  const attempts = Math.ceil(timeoutMilliseconds / COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const probe = await probeServerIdentity(url);
    if (probe.kind === 'dashboard') return { kind: 'answered' };
    const exitCode = server.exitCode();
    if (exitCode !== null) return { kind: 'exited', exitCode };
    await waitMilliseconds(COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  }
  return { kind: 'timed-out', timeoutMilliseconds };
}

export function unansweredServerTextOf(answer: Exclude<DetachedServerAnswer, { kind: 'answered' }>, logPath: string): string {
  return answer.kind === 'exited'
    ? `The dashboard server stopped while starting (exit ${answer.exitCode}); its log is ${logPath}.`
    : `The dashboard server did not answer within ${answer.timeoutMilliseconds} ms; its log is ${logPath}.`;
}
