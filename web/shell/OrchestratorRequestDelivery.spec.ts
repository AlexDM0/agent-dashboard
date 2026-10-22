/**
 * Both orchestrator requests and the verdicts read back: the route and body #013's server expects, any 2xx as sent,
 * any other status as a refusal carrying the server's text (or its status when it has none), and a network failure
 * as a refusal too, so a button never throws.
 */
import { expect, test }                                           from 'bun:test';
import type { OrchestratorRequest }                               from '../../src/shared/DashboardContract.ts';
import { deliverOrchestratorRequest, orchestratorRequestsPathOf } from './OrchestratorRequestDelivery.ts';

const EXAMPLE_REQUESTS: OrchestratorRequest[] = [
  { kind: 'start-building' },
  { kind: 'clear-low-tickets', ticketIds: ['007', '012'] },
];

test('each kind posts its body as JSON to the orchestrator requests route and reads a 204 as sent', async () => {
  for (const orchestratorRequest of EXAMPLE_REQUESTS) {
    const sentRequests: Array<{ path: string; init: RequestInit }> = [];
    const verdict = await deliverOrchestratorRequest('example-project', orchestratorRequest, (path, init) => {
      sentRequests.push({ path, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    expect(verdict).toEqual({ kind: 'sent' });
    expect(sentRequests).toHaveLength(1);
    expect(sentRequests[0]?.path).toBe('/api/projects/example-project/orchestrator-requests');
    expect(sentRequests[0]?.init.method).toBe('POST');
    expect(sentRequests[0]?.init.body).toBe(JSON.stringify(orchestratorRequest));
  }
});

test('the start-building and clear-low-tickets bodies are exactly the server protocol', async () => {
  const sentBodies: unknown[] = [];
  for (const orchestratorRequest of EXAMPLE_REQUESTS) {
    await deliverOrchestratorRequest('example-project', orchestratorRequest, (_path, init) => {
      sentBodies.push(init.body);
      return Promise.resolve(new Response(null, { status: 204 }));
    });
  }
  expect(sentBodies).toEqual(['{"kind":"start-building"}', '{"kind":"clear-low-tickets","ticketIds":["007","012"]}']);
});

test('a tracker id is encoded into the path', () => {
  expect(orchestratorRequestsPathOf('example project/one')).toBe('/api/projects/example%20project%2Fone/orchestrator-requests');
});

test('a refusal of either kind carries the server text as its reason', async () => {
  for (const orchestratorRequest of EXAMPLE_REQUESTS) {
    for (const status of [400, 404, 409, 502]) {
      const verdict = await deliverOrchestratorRequest('example-project', orchestratorRequest, () => Promise.resolve(new Response(`Example refusal ${status}\n`, { status })));
      expect(verdict).toEqual({ kind: 'refused', reason: `Example refusal ${status}` });
    }
  }
});

test('a refusal of either kind without text names its status', async () => {
  for (const orchestratorRequest of EXAMPLE_REQUESTS) {
    const verdict = await deliverOrchestratorRequest('example-project', orchestratorRequest, () => Promise.resolve(new Response('', { status: 409 })));
    expect(verdict).toEqual({ kind: 'refused', reason: 'Refused with status 409' });
  }
});

test('a network failure of either kind is a refusal, never a throw', async () => {
  for (const orchestratorRequest of EXAMPLE_REQUESTS) {
    const verdict = await deliverOrchestratorRequest('example-project', orchestratorRequest, () => Promise.reject(new TypeError('Failed to fetch')));
    expect(verdict).toEqual({ kind: 'refused', reason: 'Could not reach the dashboard server' });
  }
});
