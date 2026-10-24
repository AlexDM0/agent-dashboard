/**
 * Which sessions a crew list shows as cards while one moves into the Claude app. The cases that matter: a transferring
 * session stays a card when its snapshot says `ended` and after the snapshot drops it (the server forgets it on
 * success), so its card never unmounts mid-request; a refusal after the stop keeps the ended session a transfer card
 * until dismissed, while a refusal before the stop leaves a live session its own card with the refusal noted; and an
 * ended session with no transfer goes to the fold as before.
 */
import { expect, test } from 'bun:test';

import type { OrchestratorSession, OrchestratorState } from '../../src/shared/DashboardContract.ts';
import { orchestratorSessionWith }                     from '../testing/SnapshotFixtures.ts';
import { type SessionTransfer, SessionTransferUtil }   from './SessionTransferUtil.ts';

function sessionOf(sessionId: string, state: OrchestratorState): OrchestratorSession {
  return orchestratorSessionWith({ sessionId, state });
}

function transferOf(session: OrchestratorSession, phase: SessionTransfer['phase'], refusal: string | null = null): SessionTransfer {
  return { session, phase, refusal };
}

test('a transferring session whose snapshot says ended stays a card shown as the transfer, out of the fold', () => {
  const confirmed = sessionOf('session-moving', 'idle');
  const listed = SessionTransferUtil.listedSessionsOf([sessionOf('session-moving', 'ended')], { 'session-moving': transferOf(confirmed, 'transferring') });
  expect(listed.cards.map((card) => card.session.sessionId)).toEqual(['session-moving']);
  expect(listed.ended).toEqual([]);
  const [card] = listed.cards;
  expect(card !== undefined && SessionTransferUtil.isShownAsTransfer(card)).toBe(true);
});

test('a transferring session still live before the stop is shown as the transfer', () => {
  const live = sessionOf('session-moving', 'busy');
  const [card] = SessionTransferUtil.listedSessionsOf([live], { 'session-moving': transferOf(live, 'transferring') }).cards;
  expect(card !== undefined && SessionTransferUtil.isShownAsTransfer(card)).toBe(true);
});

test('an opened session the snapshot dropped stays a card with the session as it was at the confirm', () => {
  const confirmed = sessionOf('session-moved', 'idle');
  const listed = SessionTransferUtil.listedSessionsOf([], { 'session-moved': transferOf(confirmed, 'opened') });
  expect(listed.cards).toEqual([{ session: confirmed, transfer: transferOf(confirmed, 'opened') }]);
});

test('a refusal after the stop keeps the ended session a transfer card carrying the refusal', () => {
  const transfer = transferOf(sessionOf('session-refused', 'idle'), 'failed', 'claude --desktop exited 1');
  const [card] = SessionTransferUtil.listedSessionsOf([sessionOf('session-refused', 'ended')], { 'session-refused': transfer }).cards;
  expect(card?.transfer?.refusal).toBe('claude --desktop exited 1');
  expect(card !== undefined && SessionTransferUtil.isShownAsTransfer(card)).toBe(true);
});

test('a refusal before the stop leaves the live session its own card, the refusal noted on it', () => {
  const live = sessionOf('session-refused', 'idle');
  const [card] = SessionTransferUtil.listedSessionsOf([live], { 'session-refused': transferOf(live, 'failed', 'no claude') }).cards;
  expect(card?.transfer?.refusal).toBe('no claude');
  expect(card !== undefined && SessionTransferUtil.isShownAsTransfer(card)).toBe(false);
});

test('without a transfer an ended session goes to the fold and a running one is a plain card', () => {
  const listed = SessionTransferUtil.listedSessionsOf([sessionOf('session-running', 'busy'), sessionOf('session-over', 'ended')], {});
  expect(listed.cards).toEqual([{ session: sessionOf('session-running', 'busy'), transfer: null }]);
  expect(listed.ended.map((session) => session.sessionId)).toEqual(['session-over']);
});

test('a settled transfer is opened when the server took it and failed with its text when refused', () => {
  const transfer = transferOf(sessionOf('session-moving', 'idle'), 'transferring');
  expect(SessionTransferUtil.settledOf(transfer, { kind: 'sent' })).toEqual({ ...transfer, phase: 'opened' });
  expect(SessionTransferUtil.settledOf(transfer, { kind: 'refused', reason: 'claude exited 1' })).toEqual({ ...transfer, phase: 'failed', refusal: 'claude exited 1' });
});
