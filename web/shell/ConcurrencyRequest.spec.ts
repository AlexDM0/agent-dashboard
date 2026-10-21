/**
 * The request the page sends and the verdict it reads back: the route and body #004's server expects, any 2xx as
 * accepted, any other status as a refusal carrying the server's text, and a network failure as a refusal too, so a
 * button never throws.
 */
import { expect, test }                               from 'bun:test';
import { concurrencyPathOf, requestConcurrencyLimit } from './ConcurrencyRequest.ts';

test('the request posts the absolute limit as JSON to the project route', async () => {
  const sentRequests: Array<{ path: string; init: RequestInit }> = [];
  const verdict = await requestConcurrencyLimit('example-project', 4, (path, init) => {
    sentRequests.push({ path, init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  expect(verdict).toEqual({ kind: 'accepted' });
  expect(sentRequests).toHaveLength(1);
  expect(sentRequests[0]?.path).toBe('/api/projects/example-project/concurrency');
  expect(sentRequests[0]?.init.method).toBe('POST');
  expect(sentRequests[0]?.init.body).toBe('{"limit":4}');
});

test('a tracker id is encoded into the path', () => {
  expect(concurrencyPathOf('example project/one')).toBe('/api/projects/example%20project%2Fone/concurrency');
});

test('a refusal carries the server text as its reason', async () => {
  for (const status of [400, 409, 502]) {
    const verdict = await requestConcurrencyLimit('example-project', 4, () => Promise.resolve(new Response(`Example refusal ${status}\n`, { status })));
    expect(verdict).toEqual({ kind: 'refused', reason: `Example refusal ${status}` });
  }
});

test('a refusal without text names its status', async () => {
  const verdict = await requestConcurrencyLimit('example-project', 4, () => Promise.resolve(new Response('', { status: 409 })));
  expect(verdict).toEqual({ kind: 'refused', reason: 'Refused with status 409' });
});

test('a network failure is a refusal, never a throw', async () => {
  const verdict = await requestConcurrencyLimit('example-project', 4, () => Promise.reject(new TypeError('Failed to fetch')));
  expect(verdict).toEqual({ kind: 'refused', reason: 'Could not reach the dashboard server' });
});
