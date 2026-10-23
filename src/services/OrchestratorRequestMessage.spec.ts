/**
 * The body parser is the route's only gate before a session is messaged, so every malformed shape must be refused; the
 * texts must say whose click this is, name the project, and say what to do without stopping a running dispatcher. A
 * desktop session reads the text as a peer's message, so only its text asks for the user's confirmation.
 */
import { expect, test } from 'bun:test';

import type { OrchestratorRequest } from '../shared/DashboardContract.ts';
import {
  BOARD_ALREADY_SHOWN_INSTRUCTION,
  orchestratorMessageTextOf,
  orchestratorRequestOf,
  orchestratorStartBuildingTextOf,
  orchestratorStartTextOf
} from './OrchestratorRequestMessage.ts';

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

test('the start text opens with the orchestrate slash command, relays the click, names the project and holds the dispatcher back', () => {
  const text = orchestratorStartTextOf('example-storefront');
  expect(text.startsWith('/agent-progress-orchestrate\n')).toBe(true);
  expect(text).toContain('relays the user\'s click in the agent-dashboard');
  expect(text).toContain('example-storefront');
  expect(text).toContain('Launch no dispatcher run until the user asks you to start building');
});

test('the started-to-build text opens with the orchestrate slash command, the board-shown line, then the dashboard session\'s start-building text', () => {
  expect(orchestratorStartBuildingTextOf('example-storefront')).toBe(
    `/agent-progress-orchestrate\n${BOARD_ALREADY_SHOWN_INSTRUCTION}\n`
    + orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'dashboard-session')
  );
});

test('both start texts say, right after the slash command, that the dashboard shows the board, so no agent-progress open and no browser', () => {
  expect(BOARD_ALREADY_SHOWN_INSTRUCTION).toContain('The agent-dashboard already shows this board');
  expect(BOARD_ALREADY_SHOWN_INSTRUCTION).toContain('skip `agent-progress open`');
  expect(BOARD_ALREADY_SHOWN_INSTRUCTION).toContain('open no browser window or tab');
  for (const text of [orchestratorStartTextOf('example-storefront'), orchestratorStartBuildingTextOf('example-storefront')]) {
    expect(text, text).toStartWith(`/agent-progress-orchestrate\n${BOARD_ALREADY_SHOWN_INSTRUCTION}\n`);
  }
});

test('a request relayed through a session\'s socket carries no board-shown line, for a desktop or a dashboard-owned session', () => {
  const requests: OrchestratorRequest[] = [{ kind: 'start-building' }, { kind: 'clear-low-tickets', ticketIds: ['012'] }];
  for (const request of requests) {
    for (const recipient of ['desktop-session', 'dashboard-session'] as const) {
      const text = orchestratorMessageTextOf(request, 'example-storefront', recipient);
      expect(text, `${request.kind} ${recipient}`).not.toContain('agent-progress open');
      expect(text, `${request.kind} ${recipient}`).not.toContain('browser');
    }
  }
});

test('no message text asks the model to load a skill, which a user-only skill refuses', () => {
  const texts = [
    orchestratorStartTextOf('example-storefront'),
    orchestratorStartBuildingTextOf('example-storefront'),
    orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'desktop-session'),
    orchestratorMessageTextOf({ kind: 'clear-low-tickets', ticketIds: ['012'] }, 'example-storefront', 'desktop-session'),
  ];
  for (const text of texts) expect(text, text).not.toMatch(/\bskill\b/i);
});

test('the start-building text relays the click, names the project, and leaves a run in flight running', () => {
  const text = orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'dashboard-session');
  expect(text).toContain('relays the user\'s click in the agent-dashboard');
  expect(text).toContain('example-storefront');
  expect(text).toContain('agent-progress dispatcher');
  expect(text).toContain('already in flight, leave it running');
});

test('the clear-low-tickets text names every ticket and asks for includeLowPriority without stopping a running dispatcher', () => {
  const text = orchestratorMessageTextOf({ kind: 'clear-low-tickets', ticketIds: ['012', '014'] }, 'example-storefront', 'dashboard-session');
  expect(text).toContain('relays the user\'s click in the agent-dashboard');
  expect(text).toContain('example-storefront');
  expect(text).toContain('#012, #014');
  expect(text).toContain('Triage them');
  expect(text).toContain('`includeLowPriority: true` once no dispatcher run is in flight');
  expect(text).toContain('Never stop a running dispatcher');
});

test('a dashboard-owned session gets the start-building text exactly as before, with no confirm request', () => {
  expect(orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'dashboard-session')).toBe(
    'This message relays the user\'s click in the agent-dashboard, for the project example-storefront. The user asks you '
    + 'to start building: run this board through the agent-progress dispatcher (`.agent-progress/agent-progress-dispatch.js`). '
    + 'If a dispatcher run is already in flight, leave it running and start no second one.'
  );
});

test('a desktop session gets both kinds with a request to confirm with its user, a dashboard-owned session gets neither', () => {
  const requests: OrchestratorRequest[] = [{ kind: 'start-building' }, { kind: 'clear-low-tickets', ticketIds: ['012'] }];
  for (const request of requests) {
    const desktopText = orchestratorMessageTextOf(request, 'example-storefront', 'desktop-session');
    const ownedText = orchestratorMessageTextOf(request, 'example-storefront', 'dashboard-session');
    expect(desktopText, request.kind).toStartWith(ownedText);
    expect(desktopText, request.kind).toContain('never carries your user\'s go');
    expect(desktopText, request.kind).toContain('ask your user to confirm before you run the dispatcher or triage anything');
    expect(ownedText, request.kind).not.toContain('confirm');
  }
});
