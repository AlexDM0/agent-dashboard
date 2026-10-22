/**
 * The request the Stop button sends and the verdict it reads back: exactly `{ "state": "stopped" }` to the project's
 * dispatcher route, any 2xx as stopped, any other status as a refusal carrying the server's text, and a network
 * failure as a refusal too, so the button never throws.
 */
import { expect, test }                            from 'bun:test';
import { dispatcherPathOf, requestDispatcherStop } from './DispatcherStopRequest.ts';

test('the request posts { "state": "stopped" } as JSON to the project\'s dispatcher route', async () => {
  const sentRequests: Array<{ path: string; init: RequestInit }> = [];
  const verdict = await requestDispatcherStop('example-project', (path, init) => {
    sentRequests.push({ path, init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  expect(verdict).toEqual({ kind: 'stopped' });
  expect(sentRequests).toHaveLength(1);
  expect(sentRequests[0]?.path).toBe('/api/projects/example-project/dispatcher');
  expect(sentRequests[0]?.init.method).toBe('POST');
  expect(sentRequests[0]?.init.body).toBe('{"state":"stopped"}');
});

test('a tracker id is encoded into the path', () => {
  expect(dispatcherPathOf('example project/one')).toBe('/api/projects/example%20project%2Fone/dispatcher');
});

test('a refusal carries the server text as its reason, or names its status when there is none', async () => {
  for (const status of [400, 409, 502]) {
    const verdict = await requestDispatcherStop('example-project', () => Promise.resolve(new Response(`Example refusal ${status}\n`, { status })));
    expect(verdict).toEqual({ kind: 'refused', reason: `Example refusal ${status}` });
  }
  expect(await requestDispatcherStop('example-project', () => Promise.resolve(new Response('', { status: 409 }))))
    .toEqual({ kind: 'refused', reason: 'Refused with status 409' });
});

test('a network failure is a refusal, never a throw', async () => {
  const verdict = await requestDispatcherStop('example-project', () => Promise.reject(new TypeError('Failed to fetch')));
  expect(verdict).toEqual({ kind: 'refused', reason: 'Could not reach the dashboard server' });
});
