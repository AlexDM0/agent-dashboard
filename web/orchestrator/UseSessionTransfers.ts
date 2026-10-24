import { useCallback, useEffect, useState }          from 'react';
import type { OrchestratorSession }                  from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }                                from '../constants/WebLimits.ts';
import type { OrchestratorRequestVerdict }           from '../shell/OrchestratorRequestDelivery.ts';
import { type SessionTransfer, SessionTransferUtil } from './SessionTransferUtil.ts';

export interface SessionTransfers {
  transfersBySessionId: Record<string, SessionTransfer>;
  /** Moves one session into the Claude app; resolves true when the server took it. */
  open:                 (session: OrchestratorSession, deliver: () => Promise<OrchestratorRequestVerdict>) => Promise<boolean>;
  dismiss:              (sessionId: string) => void;
}

function withoutSessions(transfersBySessionId: Record<string, SessionTransfer>, sessionIds: string[]): Record<string, SessionTransfer> {
  return Object.fromEntries(Object.entries(transfersBySessionId).filter(([sessionId]) => !sessionIds.includes(sessionId)));
}

/** A session list's Open in Claude app requests, held above its cards so a card outlives its session's `ended`. */
export function useSessionTransfers(): SessionTransfers {
  const [transfersBySessionId, setTransfersBySessionId] = useState<Record<string, SessionTransfer>>({});

  const open = useCallback(async (session: OrchestratorSession, deliver: () => Promise<OrchestratorRequestVerdict>): Promise<boolean> => {
    const transfer: SessionTransfer = { session, phase: 'transferring', refusal: null };
    setTransfersBySessionId((previous) => ({ ...previous, [session.sessionId]: transfer }));
    const verdict = await deliver();
    setTransfersBySessionId((previous) => ({ ...previous, [session.sessionId]: SessionTransferUtil.settledOf(transfer, verdict) }));
    return verdict.kind === 'sent';
  }, []);

  const dismiss = useCallback((sessionId: string): void => {
    setTransfersBySessionId((previous) => withoutSessions(previous, [sessionId]));
  }, []);

  const openedSessionIds = Object.values(transfersBySessionId)
    .filter((transfer) => transfer.phase === 'opened')
    .map((transfer) => transfer.session.sessionId)
    .join('\n');

  // The opened beat plays out, then its card leaves.
  useEffect(() => {
    if (openedSessionIds === '') return undefined;
    const leaveTimeout = window.setTimeout(
      () => setTransfersBySessionId((previous) => withoutSessions(previous, openedSessionIds.split('\n'))),
      WEB_LIMITS.TRANSFER_OPENED_BEAT_MILLISECONDS
    );
    return () => window.clearTimeout(leaveTimeout);
  }, [openedSessionIds]);

  return { transfersBySessionId, open, dismiss };
}
