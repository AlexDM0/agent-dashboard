/**
 * The low-priority control is one button, no picker: its click sends one clear-low request naming every waiting low
 * ticket, lowest id first, and it is disabled with none waiting and while a request is out.
 */
import { expect, test }                 from 'bun:test';
import { createElement }                from 'react';
import { renderToStaticMarkup }         from 'react-dom/server';
import { deliverOrchestratorRequest }   from '../shell/OrchestratorRequestDelivery.ts';
import { OrchestratorRequestStateUtil } from '../shell/OrchestratorRequestStateUtil.ts';
import { BoardCommandUtil }             from './BoardCommandUtil.ts';
import { LowTicketClearance }           from './LowTicketClearance.tsx';

const THREE_WAITING_TICKETS = [
  { ticketId: '012', title: 'Example later ticket' },
  { ticketId: '007', title: 'Example earlier ticket' },
  { ticketId: '1000', title: 'Example long-id ticket' },
];

function clearanceMarkupOf(waitingTickets: typeof THREE_WAITING_TICKETS): string {
  return renderToStaticMarkup(createElement(LowTicketClearance, {
    trackerId: 'example-project', projectName: 'Example Project', label: 'Pick up low-priority 3', waitingTickets
  }));
}

test('the request sent names every waiting low ticket the control counts, lowest id first', async () => {
  const sentBodies: unknown[] = [];
  const verdict = await deliverOrchestratorRequest('example-project', BoardCommandUtil.lowTicketClearRequestOf(THREE_WAITING_TICKETS), (_path, init) => {
    sentBodies.push(init.body);
    return Promise.resolve(Response.json({ recipient: 'dashboard-session' }));
  });
  expect(verdict).toEqual({ kind: 'sent', recipient: 'dashboard-session' });
  expect(sentBodies).toEqual(['{"kind":"clear-low-tickets","ticketIds":["007","012","1000"]}']);
});

test('the control is one enabled button with no picker, popover toggle or ticket list', () => {
  const markup = clearanceMarkupOf(THREE_WAITING_TICKETS);
  expect(markup).toContain('aria-label="Clear every low-priority ticket of Example Project to run"');
  expect(markup).toContain('>Pick up low-priority 3</button>');
  expect(markup).not.toContain('disabled');
  expect(markup).not.toContain('checkbox');
  expect(markup).not.toContain('aria-expanded');
  expect(markup).not.toContain('Example earlier ticket');
});

test('with no low ticket waiting the button is disabled', () => {
  expect(clearanceMarkupOf([])).toContain('disabled=""');
});

test('a request out keeps the button busy, so disabled, until its verdict', () => {
  const sendingState = OrchestratorRequestStateUtil.nextStateOf(OrchestratorRequestStateUtil.initialState(), { kind: 'request-sent' });
  expect(OrchestratorRequestStateUtil.isBusy(sendingState)).toBe(true);
  const refusal = { kind: 'refused', reason: 'Example refusal' } as const;
  const refusedState = OrchestratorRequestStateUtil.nextStateOf(sendingState, { kind: 'verdict-received', verdict: refusal });
  expect(OrchestratorRequestStateUtil.isBusy(refusedState)).toBe(false);
  expect(OrchestratorRequestStateUtil.noteOf(refusedState)).toEqual({ text: 'Example refusal', isRefusal: true });
});
