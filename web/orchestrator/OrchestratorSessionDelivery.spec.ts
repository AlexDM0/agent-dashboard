/**
 * The four session requests against #017 and #018's routes: each asks for the launch token first and carries it in
 * its header, with the method, path and body the server expects; a refused token, a 403 or any other refusal comes
 * back with the server's text, and a network failure is a refusal too, never a throw.
 */
import { expect, test } from 'bun:test';
import {
  orchestratorEventsPathOf,
  sendOrchestratorAnswer,
  sendOrchestratorChat,
  startOrchestrator,
  stopOrchestrator
} from './OrchestratorSessionDelivery.ts';

interface SentRequest { path: string; init: RequestInit }

function recordingSender(finalResponse: () => Response): { sentRequests: SentRequest[]; sendRequest: (path: string, init: RequestInit) => Promise<Response> } {
  const sentRequests: SentRequest[] = [];
  return {
    sentRequests,
    sendRequest(path, init) {
      sentRequests.push({ path, init });
      return Promise.resolve(path === '/api/launch-token' ? Response.json({ token: 'token-example' }) : finalResponse());
    },
  };
}

function headerOf(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

test('each request takes the launch token, then carries it to its route with its method and body', async () => {
  type Sender = ReturnType<typeof recordingSender>['sendRequest'];
  const cases = [
    {
      deliver: (sender: Sender) => startOrchestrator('tracker-example', { startBuilding: false }, sender),
      path:    '/api/projects/tracker-example/orchestrator',
      body:    '{"startBuilding":false}',
    },
    {
      deliver: (sender: Sender) => sendOrchestratorChat('tracker-example', { text: 'Hello', sessionId: 'session-example' }, sender),
      path:    '/api/projects/tracker-example/orchestrator/messages',
      body:    '{"text":"Hello","sessionId":"session-example"}',
    },
    {
      deliver: (sender: Sender) => sendOrchestratorAnswer('tracker-example', { requestId: 'request-example', answers: { 'Which?': 'Red' } }, sender),
      path:    '/api/projects/tracker-example/orchestrator/answers',
      body:    '{"requestId":"request-example","answers":{"Which?":"Red"}}',
    },
  ];
  for (const requestCase of cases) {
    const { sentRequests, sendRequest } = recordingSender(() => new Response(null, { status: 204 }));
    const verdict = await requestCase.deliver(sendRequest);
    expect(verdict).toEqual({ kind: 'sent' });
    expect(sentRequests.map((request) => request.path)).toEqual(['/api/launch-token', requestCase.path]);
    expect(sentRequests[1]?.init.method).toBe('POST');
    expect(sentRequests[1]?.init.body).toBe(requestCase.body);
    expect(headerOf(sentRequests[1]?.init, 'X-Agent-Dashboard-Launch-Token')).toBe('token-example');
  }
});

test('a stop is a DELETE without a body, carrying the token', async () => {
  const { sentRequests, sendRequest } = recordingSender(() => new Response(null, { status: 204 }));
  expect(await stopOrchestrator('tracker-example', sendRequest)).toEqual({ kind: 'sent' });
  expect(sentRequests[1]?.init.method).toBe('DELETE');
  expect(sentRequests[1]?.init.body).toBeUndefined();
  expect(headerOf(sentRequests[1]?.init, 'X-Agent-Dashboard-Launch-Token')).toBe('token-example');
});

test('a 403 or a 409 refusal carries the server text', async () => {
  for (const status of [403, 409]) {
    const { sendRequest } = recordingSender(() => new Response(`Example refusal ${String(status)}\n`, { status }));
    const verdict = await startOrchestrator('tracker-example', { startBuilding: false }, sendRequest);
    expect(verdict).toEqual({ kind: 'refused', reason: `Example refusal ${String(status)}` });
  }
});

test('a refused launch token stops the request before it is sent', async () => {
  const sentPaths: string[] = [];
  const verdict = await stopOrchestrator('tracker-example', (path) => {
    sentPaths.push(path);
    return Promise.resolve(new Response('Forbidden', { status: 403 }));
  });
  expect(verdict).toEqual({ kind: 'refused', reason: 'Forbidden' });
  expect(sentPaths).toEqual(['/api/launch-token']);
});

test('a refusal without text names its status, and a network failure is a refusal', async () => {
  const { sendRequest } = recordingSender(() => new Response('', { status: 502 }));
  expect(await sendOrchestratorChat('tracker-example', { text: 'Hello' }, sendRequest)).toEqual({ kind: 'refused', reason: 'Refused with status 502' });
  const failedVerdict = await sendOrchestratorChat('tracker-example', { text: 'Hello' }, () => Promise.reject(new TypeError('Failed to fetch')));
  expect(failedVerdict).toEqual({ kind: 'refused', reason: 'Could not reach the dashboard server' });
});

test('the events path encodes the tracker id', () => {
  expect(orchestratorEventsPathOf('example project/one')).toBe('/api/projects/example%20project%2Fone/orchestrator/events');
});
