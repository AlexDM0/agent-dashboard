/**
 * A menu action's life: choosing an item only asks, Cancel returns to choosing and never reaches the sending step
 * (the only step that runs the action), a confirm sends once, and the verdict closes the question or shows the
 * refusal, from which a retry sends again. Closing the panel forgets a question but not a request already out.
 */
import { expect, test }                from 'bun:test';
import { type MenuStep, MenuStepUtil } from './MenuStepUtil.ts';

const { initialStep, nextStepOf, startsSending } = MenuStepUtil;

const CONFIRMING_STOP: MenuStep = { kind: 'confirming', actionId: 'stop' };
const SENDING_STOP: MenuStep = { kind: 'sending', actionId: 'stop' };

test('choosing an item asks for confirmation and sends nothing', () => {
  const confirmingStep = nextStepOf(initialStep(), { kind: 'action-chosen', actionId: 'stop' });
  expect(confirmingStep).toEqual(CONFIRMING_STOP);
  expect(startsSending(initialStep(), confirmingStep)).toBe(false);
});

test('Cancel returns to choosing without ever starting the action', () => {
  const cancelledStep = nextStepOf(CONFIRMING_STOP, { kind: 'cancelled' });
  expect(cancelledStep).toEqual({ kind: 'choosing' });
  expect(startsSending(CONFIRMING_STOP, cancelledStep)).toBe(false);
  expect(nextStepOf(cancelledStep, { kind: 'confirmed' })).toEqual({ kind: 'choosing' });
});

test('only a confirm starts the chosen action, and a second confirm while it is out does not start it again', () => {
  const sendingStep = nextStepOf(CONFIRMING_STOP, { kind: 'confirmed' });
  expect(sendingStep).toEqual(SENDING_STOP);
  expect(startsSending(CONFIRMING_STOP, sendingStep)).toBe(true);
  expect(startsSending(sendingStep, nextStepOf(sendingStep, { kind: 'confirmed' }))).toBe(false);
});

test('a done verdict returns to choosing; a refusal shows its reason and a confirm retries', () => {
  expect(nextStepOf(SENDING_STOP, { kind: 'verdict-received', verdict: { kind: 'done' } })).toEqual({ kind: 'choosing' });
  const refusedStep = nextStepOf(SENDING_STOP, { kind: 'verdict-received', verdict: { kind: 'refused', reason: 'Example refusal' } });
  expect(refusedStep).toEqual({ kind: 'refused', actionId: 'stop', reason: 'Example refusal' });
  expect(startsSending(refusedStep, nextStepOf(refusedStep, { kind: 'confirmed' }))).toBe(true);
  expect(nextStepOf(refusedStep, { kind: 'cancelled' })).toEqual({ kind: 'choosing' });
});

test('closing the panel forgets a question but keeps a request that is out, so its verdict still lands', () => {
  expect(nextStepOf(CONFIRMING_STOP, { kind: 'closed' })).toEqual({ kind: 'choosing' });
  expect(nextStepOf(SENDING_STOP, { kind: 'closed' })).toEqual(SENDING_STOP);
  expect(nextStepOf({ kind: 'choosing' }, { kind: 'verdict-received', verdict: { kind: 'done' } })).toEqual({ kind: 'choosing' });
});
