/**
 * A request button's life: busy only while sending, then the sent note or the refusal, the sent note fading on its
 * timer while a refusal stays, and the next click replacing whichever note was shown. The sent note differs by
 * recipient: only a desktop session's says the user will be asked to confirm.
 */
import { expect, test } from 'bun:test';
import {
  OrchestratorRequestStateUtil,
  SENDING_NOTE,
  SENT_FOR_CONFIRMATION_NOTE,
  SENT_NOTE
} from './OrchestratorRequestStateUtil.ts';

const {
  initialState, nextStateOf, isBusy, noteOf
} = OrchestratorRequestStateUtil;

test('a sent request is busy and shows the sending note until its verdict', () => {
  const sendingState = nextStateOf(initialState(), { kind: 'request-sent' });
  expect(isBusy(sendingState)).toBe(true);
  expect(noteOf(sendingState)).toEqual({ text: SENDING_NOTE, isRefusal: false });
});

test('a verdict sent to a dashboard-owned session shows the sent note, which its timer clears', () => {
  const sentState = nextStateOf({ kind: 'sending' }, { kind: 'verdict-received', verdict: { kind: 'sent', recipient: 'dashboard-session' } });
  expect(isBusy(sentState)).toBe(false);
  expect(noteOf(sentState)).toEqual({ text: SENT_NOTE, isRefusal: false });
  expect(nextStateOf(sentState, { kind: 'sent-note-elapsed' })).toEqual({ kind: 'idle' });
});

test('a verdict sent to a desktop session says the orchestrator will ask the user to confirm', () => {
  const sentState = nextStateOf({ kind: 'sending' }, { kind: 'verdict-received', verdict: { kind: 'sent', recipient: 'desktop-session' } });
  expect(noteOf(sentState)).toEqual({ text: SENT_FOR_CONFIRMATION_NOTE, isRefusal: false });
  expect(SENT_FOR_CONFIRMATION_NOTE).toContain('will ask you to confirm');
  expect(SENT_NOTE).not.toContain('confirm');
  expect(nextStateOf(sentState, { kind: 'sent-note-elapsed' })).toEqual({ kind: 'idle' });
});

test('a refusal shows its reason as a refusal and outlives the sent-note timer', () => {
  const refusedState = nextStateOf({ kind: 'sending' }, { kind: 'verdict-received', verdict: { kind: 'refused', reason: 'Example refusal' } });
  expect(isBusy(refusedState)).toBe(false);
  expect(noteOf(refusedState)).toEqual({ text: 'Example refusal', isRefusal: true });
  expect(nextStateOf(refusedState, { kind: 'sent-note-elapsed' })).toBe(refusedState);
});

test('the next click replaces a shown note', () => {
  expect(nextStateOf({ kind: 'sent', recipient: 'desktop-session' }, { kind: 'request-sent' })).toEqual({ kind: 'sending' });
  expect(nextStateOf({ kind: 'refused', reason: 'Example refusal' }, { kind: 'request-sent' })).toEqual({ kind: 'sending' });
});

test('a verdict arriving outside a send is ignored', () => {
  expect(nextStateOf({ kind: 'idle' }, { kind: 'verdict-received', verdict: { kind: 'sent', recipient: 'dashboard-session' } })).toEqual({ kind: 'idle' });
});

test('an idle button shows no note', () => {
  expect(noteOf(initialState())).toBeNull();
  expect(isBusy(initialState())).toBe(false);
});
