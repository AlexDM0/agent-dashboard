import type { ConcurrencyRequestVerdict } from './ConcurrencyRequest.ts';

export type ConcurrencyStepperState =
  | { kind: 'idle' }
  | { kind: 'sending'; requestedLimit: number }
  | { kind: 'awaiting-snapshot'; requestedLimit: number }
  | { kind: 'refused'; reason: string }
  | { kind: 'snapshot-overdue' };

export type ConcurrencyStepperEvent =
  | { kind: 'request-sent'; requestedLimit: number }
  | { kind: 'verdict-received'; verdict: ConcurrencyRequestVerdict; shownLimit: number }
  | { kind: 'snapshot-received'; shownLimit: number }
  | { kind: 'snapshot-wait-elapsed' };

export const SNAPSHOT_OVERDUE_NOTE = 'The new limit has not arrived yet';

/** A step is lost unless the next one is computed from a snapshot carrying the last, so the stepper waits for it. */
export const ConcurrencyStepperStateUtil = Object.freeze({
  initialState(): ConcurrencyStepperState {
    return { kind: 'idle' };
  },

  nextStateOf(state: ConcurrencyStepperState, event: ConcurrencyStepperEvent): ConcurrencyStepperState {
    switch (event.kind) {
      case 'request-sent':
        return { kind: 'sending', requestedLimit: event.requestedLimit };
      case 'verdict-received':
        if (state.kind !== 'sending') return state;
        if (event.verdict.kind === 'refused') return { kind: 'refused', reason: event.verdict.reason };
        return event.shownLimit === state.requestedLimit
          ? { kind: 'idle' }
          : { kind: 'awaiting-snapshot', requestedLimit: state.requestedLimit };
      case 'snapshot-received':
        return state.kind === 'awaiting-snapshot' && event.shownLimit === state.requestedLimit ? { kind: 'idle' } : state;
      case 'snapshot-wait-elapsed':
        return state.kind === 'awaiting-snapshot' ? { kind: 'snapshot-overdue' } : state;
    }
  },

  isBusy(state: ConcurrencyStepperState): boolean {
    return state.kind === 'sending' || state.kind === 'awaiting-snapshot';
  },

  /** The refusal reason or the overdue note, whichever the state carries. */
  noteOf(state: ConcurrencyStepperState): { text: string; isRefusal: boolean } | null {
    if (state.kind === 'refused') return { text: state.reason, isRefusal: true };
    if (state.kind === 'snapshot-overdue') return { text: SNAPSHOT_OVERDUE_NOTE, isRefusal: false };
    return null;
  },
});
