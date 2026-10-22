/**
 * The Stop button's life: a click only asks, a cancel returns to idle and sends nothing, a confirmation sends, and
 * the verdict shows the stopped note (which no further click replaces) or the refusal, after which Stop is offered
 * again. The question names the agents in flight in plain counting words.
 */
import { expect, test }                                         from 'bun:test';
import { DispatcherStopStateUtil, STOPPED_NOTE, STOPPING_NOTE } from './DispatcherStopStateUtil.ts';

const {
  initialState, nextStateOf, isStopAvailable, confirmationQuestionOf, noteOf
} = DispatcherStopStateUtil;

test('a click asks for confirmation and a cancel returns to idle without sending', () => {
  const confirmingState = nextStateOf(initialState(), { kind: 'stop-asked' });
  expect(confirmingState).toEqual({ kind: 'confirming' });
  expect(isStopAvailable(confirmingState)).toBe(false);
  expect(nextStateOf(confirmingState, { kind: 'stop-cancelled' })).toEqual({ kind: 'idle' });
});

test('only a confirmation sends, showing the stopping note', () => {
  expect(nextStateOf(initialState(), { kind: 'stop-confirmed' })).toEqual({ kind: 'idle' });
  const sendingState = nextStateOf({ kind: 'confirming' }, { kind: 'stop-confirmed' });
  expect(sendingState).toEqual({ kind: 'sending' });
  expect(noteOf(sendingState)).toEqual({ text: STOPPING_NOTE, isRefusal: false });
});

test('a stopped verdict shows the stopped note, which no further click replaces', () => {
  const stoppedState = nextStateOf({ kind: 'sending' }, { kind: 'verdict-received', verdict: { kind: 'stopped' } });
  expect(noteOf(stoppedState)).toEqual({ text: STOPPED_NOTE, isRefusal: false });
  expect(isStopAvailable(stoppedState)).toBe(false);
  expect(nextStateOf(stoppedState, { kind: 'stop-asked' })).toBe(stoppedState);
});

test('a refusal shows its reason inline and offers Stop again', () => {
  const refusedState = nextStateOf({ kind: 'sending' }, { kind: 'verdict-received', verdict: { kind: 'refused', reason: 'Example refusal' } });
  expect(noteOf(refusedState)).toEqual({ text: 'Example refusal', isRefusal: true });
  expect(isStopAvailable(refusedState)).toBe(true);
  expect(nextStateOf(refusedState, { kind: 'stop-asked' })).toEqual({ kind: 'confirming' });
});

test('a verdict arriving outside a send is ignored', () => {
  expect(nextStateOf({ kind: 'idle' }, { kind: 'verdict-received', verdict: { kind: 'stopped' } })).toEqual({ kind: 'idle' });
});

test('the question names the agents in flight', () => {
  expect(confirmationQuestionOf(0)).toBe('Stop the dispatcher? No agent is in flight.');
  expect(confirmationQuestionOf(1)).toBe('Stop the dispatcher? 1 agent in flight finishes first.');
  expect(confirmationQuestionOf(2)).toBe('Stop the dispatcher? 2 agents in flight finish first.');
});
