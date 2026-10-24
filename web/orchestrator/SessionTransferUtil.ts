import type { OrchestratorSession }        from '../../src/shared/DashboardContract.ts';
import type { OrchestratorRequestVerdict } from '../shell/OrchestratorRequestDelivery.ts';
import { EndedSessionSplitUtil }           from './EndedSessionSplitUtil.ts';

export type SessionTransferPhase = 'transferring' | 'opened' | 'failed';

/** An Open in Claude app request of one session, from its confirm until it leaves or its refusal is dismissed. */
export interface SessionTransfer {
  /** The session as it was at the confirm, kept for when the snapshot drops it. */
  session: OrchestratorSession;
  phase:   SessionTransferPhase;
  refusal: string | null;
}

/** A session listed as a card: the snapshot's session, or the transfer's own once the snapshot dropped it. */
export interface ListedSession {
  session:  OrchestratorSession;
  transfer: SessionTransfer | null;
}

export interface ListedSessions {
  cards: ListedSession[];
  ended: OrchestratorSession[];
}

function sessionItself(session: OrchestratorSession): OrchestratorSession {
  return session;
}

function transferOf(transfersBySessionId: Record<string, SessionTransfer>, sessionId: string): SessionTransfer | null {
  return Object.hasOwn(transfersBySessionId, sessionId) ? transfersBySessionId[sessionId] ?? null : null;
}

/**
 * The running sessions and every session with a transfer as cards, so a card being moved stays mounted through `ended`
 * and after the snapshot drops it; the other ended sessions go to the fold.
 */
function listedSessionsOf(sessions: OrchestratorSession[], transfersBySessionId: Record<string, SessionTransfer>): ListedSessions {
  const listedIds = new Set(sessions.map((session) => session.sessionId));
  const cards = sessions
    .map((session) => ({ session, transfer: transferOf(transfersBySessionId, session.sessionId) }))
    .filter((listed) => listed.transfer !== null || listed.session.state !== 'ended');
  const droppedTransfers = Object.values(transfersBySessionId)
    .filter((transfer) => !listedIds.has(transfer.session.sessionId))
    .map((transfer) => ({ session: transfer.session, transfer }));
  const foldedSessions = sessions.filter((session) => transferOf(transfersBySessionId, session.sessionId) === null);
  return { cards: [...cards, ...droppedTransfers], ended: EndedSessionSplitUtil.splitOf(foldedSessions, sessionItself).ended };
}

/** The transfer once its request resolved: opened when the server took it, else failed with the server's text. */
function settledOf(transfer: SessionTransfer, verdict: OrchestratorRequestVerdict): SessionTransfer {
  return verdict.kind === 'sent'
    ? { ...transfer, phase: 'opened', refusal: null }
    : { ...transfer, phase: 'failed', refusal: verdict.reason };
}

/** A refusal before the stop leaves the session live, so its card stays the session's own with the refusal noted. */
function isShownAsTransfer({ session, transfer }: ListedSession): boolean {
  if (transfer === null) return false;
  return transfer.phase !== 'failed' || session.state === 'ended';
}

export const SessionTransferUtil = Object.freeze({
  listedSessionsOf,
  settledOf,
  isShownAsTransfer,
});
