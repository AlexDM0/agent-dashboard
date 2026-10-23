import type { OrchestratorRecipient }  from '../../src/shared/DashboardContract.ts';
import type { RecipientNamingVerdict } from './OrchestratorRequestDelivery.ts';

export type OrchestratorRequestState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; recipient: OrchestratorRecipient }
  | { kind: 'refused'; reason: string };

export type OrchestratorRequestEvent =
  | { kind: 'request-sent' }
  | { kind: 'verdict-received'; verdict: RecipientNamingVerdict }
  | { kind: 'sent-note-elapsed' };

export const SENDING_NOTE = 'Sending…';
export const SENT_NOTE = 'Sent to the orchestrator';
/** A desktop session reads the request as a peer's message, which never carries the user's go. */
export const SENT_FOR_CONFIRMATION_NOTE = 'Sent: the orchestrator will ask you to confirm';

/** The request changes nothing in the snapshot, so there is nothing to wait for past the server's answer. */
export const OrchestratorRequestStateUtil = Object.freeze({
  initialState(): OrchestratorRequestState {
    return { kind: 'idle' };
  },

  nextStateOf(state: OrchestratorRequestState, event: OrchestratorRequestEvent): OrchestratorRequestState {
    switch (event.kind) {
      case 'request-sent':
        return { kind: 'sending' };
      case 'verdict-received':
        if (state.kind !== 'sending') return state;
        return event.verdict.kind === 'sent'
          ? { kind: 'sent', recipient: event.verdict.recipient }
          : { kind: 'refused', reason: event.verdict.reason };
      case 'sent-note-elapsed':
        return state.kind === 'sent' ? { kind: 'idle' } : state;
    }
  },

  isBusy(state: OrchestratorRequestState): boolean {
    return state.kind === 'sending';
  },

  noteOf(state: OrchestratorRequestState): { text: string; isRefusal: boolean } | null {
    if (state.kind === 'sending') return { text: SENDING_NOTE, isRefusal: false };
    if (state.kind === 'sent') {
      return { text: state.recipient === 'dashboard-session' ? SENT_NOTE : SENT_FOR_CONFIRMATION_NOTE, isRefusal: false };
    }
    if (state.kind === 'refused') return { text: state.reason, isRefusal: true };
    return null;
  },
});
