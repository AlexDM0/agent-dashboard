/**
 * The body parser is the route's only gate before a session is messaged, so every malformed shape must be refused; the
 * texts must say whose click this is, name the project, and say what to do without stopping a running dispatcher.
 */
import { expect, test } from 'bun:test';

import { orchestratorMessageTextOf, orchestratorRequestOf } from './OrchestratorRequestMessage.ts';

test('the two kinds parse, ticket ids kept in the order given', () => {
  expect(orchestratorRequestOf(JSON.stringify({ kind: 'start-building' }))).toEqual({ kind: 'start-building' });
  expect(orchestratorRequestOf(JSON.stringify({ kind: 'clear-low-tickets', ticketIds: ['014', '012'] })))
    .toEqual({ kind: 'clear-low-tickets', ticketIds: ['014', '012'] });
  expect(orchestratorRequestOf(JSON.stringify({ kind: 'clear-low-tickets', ticketIds: Array.from({ length: 50 }, (_value, i) => String(i)) })))
    .not.toBeNull();
});

test('an unknown kind, missing, empty, non-string or more than 50 ids, and non-JSON bodies are refused', () => {
  const badBodies = [
    JSON.stringify({ kind: 'stop-building' }),
    JSON.stringify({ kind: 'clear-low-tickets' }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: [] }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: [12] }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: [''] }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: '012' }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: Array.from({ length: 51 }, (_value, i) => String(i)) }),
    JSON.stringify({ ticketIds: ['012'] }),
    JSON.stringify([{ kind: 'start-building' }]),
    'null',
    'not json',
    '',
  ];
  for (const body of badBodies) expect(orchestratorRequestOf(body), body).toBeNull();
});

test('the start-building text relays the click, names the project, and leaves a run in flight running', () => {
  const text = orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront');
  expect(text).toContain('relays the user\'s click in the agent-dashboard');
  expect(text).toContain('example-storefront');
  expect(text).toContain('agent-progress dispatcher');
  expect(text).toContain('already in flight, leave it running');
});

test('the clear-low-tickets text names every ticket and asks for includeLowPriority without stopping a running dispatcher', () => {
  const text = orchestratorMessageTextOf({ kind: 'clear-low-tickets', ticketIds: ['012', '014'] }, 'example-storefront');
  expect(text).toContain('relays the user\'s click in the agent-dashboard');
  expect(text).toContain('example-storefront');
  expect(text).toContain('#012, #014');
  expect(text).toContain('Triage them');
  expect(text).toContain('`includeLowPriority: true` once no dispatcher run is in flight');
  expect(text).toContain('Never stop a running dispatcher');
});
