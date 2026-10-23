/**
 * What "Clear to run" sends: exactly the picked ids, lowest first whatever order they were picked in, a second click
 * unpicking, and a ticket that stopped waiting leaving the selection so it is never sent.
 */
import { expect, test }               from 'bun:test';
import { deliverOrchestratorRequest } from '../shell/OrchestratorRequestDelivery.ts';
import { LowTicketSelectionUtil }     from './LowTicketSelectionUtil.ts';

const { toggledSelectionOf, stillWaitingSelectionOf, clearRequestOf } = LowTicketSelectionUtil;

test('selecting two low tickets and clearing them sends exactly both ids, lowest first', async () => {
  const selectedTicketIds = toggledSelectionOf(toggledSelectionOf([], '012'), '007');
  const sentBodies: unknown[] = [];
  const verdict = await deliverOrchestratorRequest('example-project', clearRequestOf(selectedTicketIds), (_path, init) => {
    sentBodies.push(init.body);
    return Promise.resolve(Response.json({ recipient: 'desktop-session' }));
  });
  expect(verdict).toEqual({ kind: 'sent', recipient: 'desktop-session' });
  expect(sentBodies).toEqual(['{"kind":"clear-low-tickets","ticketIds":["007","012"]}']);
});

test('ticket ids order numerically, so a longer id sorts after a shorter one', () => {
  expect(clearRequestOf(['1000', '999'])).toEqual({ kind: 'clear-low-tickets', ticketIds: ['999', '1000'] });
});

test('toggling a selected ticket unpicks it', () => {
  expect(toggledSelectionOf(['007', '012'], '007')).toEqual(['012']);
});

test('a ticket no longer waiting leaves the selection', () => {
  expect(stillWaitingSelectionOf(['007', '012'], [{ ticketId: '012', title: 'Example ticket' }])).toEqual(['012']);
});
