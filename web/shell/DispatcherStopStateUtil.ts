import type { DispatcherStopVerdict } from './DispatcherStopRequest.ts';

export type DispatcherStopState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'sending' }
  | { kind: 'stopped' }
  | { kind: 'refused'; reason: string };

export type DispatcherStopEvent =
  | { kind: 'stop-asked' }
  | { kind: 'stop-cancelled' }
  | { kind: 'stop-confirmed' }
  | { kind: 'verdict-received'; verdict: DispatcherStopVerdict };

export const STOPPING_NOTE = 'Stopping…';
export const STOPPED_NOTE = 'Stopped: agents in flight finish first';

/** The stopped note stays as long as the button does, which is until a snapshot shows the dispatcher no longer running. */
export const DispatcherStopStateUtil = Object.freeze({
  initialState(): DispatcherStopState {
    return { kind: 'idle' };
  },

  nextStateOf(state: DispatcherStopState, event: DispatcherStopEvent): DispatcherStopState {
    switch (event.kind) {
      case 'stop-asked':
        return state.kind === 'sending' || state.kind === 'stopped' ? state : { kind: 'confirming' };
      case 'stop-cancelled':
        return state.kind === 'confirming' ? { kind: 'idle' } : state;
      case 'stop-confirmed':
        return state.kind === 'confirming' ? { kind: 'sending' } : state;
      case 'verdict-received':
        if (state.kind !== 'sending') return state;
        return event.verdict.kind === 'stopped' ? { kind: 'stopped' } : { kind: 'refused', reason: event.verdict.reason };
    }
  },

  isStopAvailable(state: DispatcherStopState): boolean {
    return state.kind === 'idle' || state.kind === 'refused';
  },

  confirmationQuestionOf(agentsInFlight: number): string {
    if (agentsInFlight === 0) return 'Stop the dispatcher? No agent is in flight.';
    if (agentsInFlight === 1) return 'Stop the dispatcher? 1 agent in flight finishes first.';
    return `Stop the dispatcher? ${agentsInFlight} agents in flight finish first.`;
  },

  noteOf(state: DispatcherStopState): { text: string; isRefusal: boolean } | null {
    if (state.kind === 'sending') return { text: STOPPING_NOTE, isRefusal: false };
    if (state.kind === 'stopped') return { text: STOPPED_NOTE, isRefusal: false };
    if (state.kind === 'refused') return { text: state.reason, isRefusal: true };
    return null;
  },
});
