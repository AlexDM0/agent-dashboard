/**
 * The request the menu's confirmed Restart sends and the verdict it reads back: a bodiless POST to the restart route
 * carrying its guard header, a 202 as restarting, any other status as a refusal carrying the server's text, and a
 * network failure as a refusal too, so the menu never throws.
 */
import { expect, test }         from 'bun:test';
import { requestServerRestart } from './ServerRestartRequest.ts';

test('the request posts without a body to the restart route with its guard header', async () => {
  const sentRequests: Array<{ path: string; init: RequestInit }> = [];
  const verdict = await requestServerRestart((path, init) => {
    sentRequests.push({ path, init });
    return Promise.resolve(new Response('Restarting', { status: 202 }));
  });
  expect(verdict).toEqual({ kind: 'restarting' });
  expect(sentRequests).toHaveLength(1);
  expect(sentRequests[0]?.path).toBe('/api/restart');
  expect(sentRequests[0]?.init.method).toBe('POST');
  expect(sentRequests[0]?.init.body).toBeUndefined();
  expect(sentRequests[0]?.init.headers).toEqual({ 'X-Agent-Dashboard-Restart': '1' });
});

test('a refusal carries the server text as its reason, or names its status when there is none', async () => {
  expect(await requestServerRestart(() => Promise.resolve(new Response('Forbidden\n', { status: 403 }))))
    .toEqual({ kind: 'refused', reason: 'Forbidden' });
  expect(await requestServerRestart(() => Promise.resolve(new Response('', { status: 405 }))))
    .toEqual({ kind: 'refused', reason: 'Refused with status 405' });
});

test('a network failure is a refusal, never a throw', async () => {
  expect(await requestServerRestart(() => Promise.reject(new TypeError('Failed to fetch'))))
    .toEqual({ kind: 'refused', reason: 'Could not reach the dashboard server' });
});
