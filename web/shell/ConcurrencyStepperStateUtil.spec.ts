/**
 * The stepper stays busy after an accepted limit until a snapshot carries it, so a second quick click steps from the
 * new limit rather than resending the old one; the wait is bounded, ending with a note, and a refusal ends it at once.
 */
import { expect, test }                                                                     from 'bun:test';
import { WEB_LIMITS }                                                                       from '../constants/WebLimits.ts';
import { ConcurrencyStepperStateUtil, SNAPSHOT_OVERDUE_NOTE, type ConcurrencyStepperState } from './ConcurrencyStepperStateUtil.ts';

const {
  nextStateOf, isBusy, noteOf, initialState
} = ConcurrencyStepperStateUtil;

function acceptedStateWhileShowing(shownLimit: number, requestedLimit: number): ConcurrencyStepperState {
  const sendingState = nextStateOf(initialState(), { kind: 'request-sent', requestedLimit });
  return nextStateOf(sendingState, { kind: 'verdict-received', verdict: { kind: 'accepted' }, shownLimit });
}

test('the stepper is busy while its request is in flight', () => {
  expect(isBusy(nextStateOf(initialState(), { kind: 'request-sent', requestedLimit: 2 }))).toBe(true);
});

test('an accepted limit keeps the stepper busy until a snapshot carries it, then re-enables it', () => {
  const awaitingState = acceptedStateWhileShowing(1, 2);
  expect(isBusy(awaitingState)).toBe(true);
  const stillAwaitingState = nextStateOf(awaitingState, { kind: 'snapshot-received', shownLimit: 1 });
  expect(isBusy(stillAwaitingState)).toBe(true);
  const settledState = nextStateOf(stillAwaitingState, { kind: 'snapshot-received', shownLimit: 2 });
  expect(isBusy(settledState)).toBe(false);
  expect(noteOf(settledState)).toBeNull();
});

test('an accepted limit a snapshot already carried re-enables at once', () => {
  expect(isBusy(acceptedStateWhileShowing(2, 2))).toBe(false);
});

test('with no snapshot the bounded wait re-enables the stepper with a note that the limit has not arrived', () => {
  const overdueState = nextStateOf(acceptedStateWhileShowing(1, 2), { kind: 'snapshot-wait-elapsed' });
  expect(isBusy(overdueState)).toBe(false);
  expect(noteOf(overdueState)).toEqual({ text: SNAPSHOT_OVERDUE_NOTE, isRefusal: false });
});

test('the snapshot wait is bounded to at most five seconds', () => {
  expect(WEB_LIMITS.CONCURRENCY_SNAPSHOT_WAIT_MILLISECONDS).toBeGreaterThan(0);
  expect(WEB_LIMITS.CONCURRENCY_SNAPSHOT_WAIT_MILLISECONDS).toBeLessThanOrEqual(5_000);
});

test('a refusal re-enables at once with its reason', () => {
  const sendingState = nextStateOf(initialState(), { kind: 'request-sent', requestedLimit: 2 });
  const refusedState = nextStateOf(sendingState, { kind: 'verdict-received', verdict: { kind: 'refused', reason: 'Example refusal' }, shownLimit: 1, });
  expect(isBusy(refusedState)).toBe(false);
  expect(noteOf(refusedState)).toEqual({ text: 'Example refusal', isRefusal: true });
});

test('a new request clears an earlier note', () => {
  const overdueState = nextStateOf(acceptedStateWhileShowing(1, 2), { kind: 'snapshot-wait-elapsed' });
  expect(noteOf(nextStateOf(overdueState, { kind: 'request-sent', requestedLimit: 3 }))).toBeNull();
});

test('a late wait or snapshot leaves a settled stepper as it is', () => {
  expect(nextStateOf(initialState(), { kind: 'snapshot-wait-elapsed' })).toEqual({ kind: 'idle' });
  expect(nextStateOf(initialState(), { kind: 'snapshot-received', shownLimit: 4 })).toEqual({ kind: 'idle' });
});
