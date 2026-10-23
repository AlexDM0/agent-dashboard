/**
 * The overlay's requests against a scratch mock server on a loopback port (A3): "New spar" posts `{ "mode": "spar" }`
 * to the product owner's route; each quick prompt goes through its session's own messages route as exactly its text,
 * carrying the launch token; a watched session's message names its session.
 */
import { afterAll, expect, test } from 'bun:test';

import { chatSnapshotWith }                                             from '../testing/SnapshotFixtures.ts';
import { ChatConversationListUtil }                                     from './ChatConversationListUtil.ts';
import { QUICK_PROMPTS, sendToConversation, startSparringProductOwner } from './ChatOverlayRequests.ts';

interface ReceivedRequest { method: string; path: string; token: string | null; body: unknown }

const receivedRequests: ReceivedRequest[] = [];
const mockServer = Bun.serve({
  port:     0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/launch-token') return Response.json({ token: 'token-example' });
    const bodyText = await request.text();
    receivedRequests.push({
      method: request.method, path: pathname, token: request.headers.get('X-Agent-Dashboard-Launch-Token'), body: bodyText === '' ? null : JSON.parse(bodyText)
    });
    return new Response(null, { status: 204 });
  },
});
afterAll(() => mockServer.stop(true));

const sendToMockServer = (path: string, init: RequestInit): Promise<Response> => fetch(new URL(path, mockServer.url), init);

function conversationOf(key: string) {
  const snapshot = chatSnapshotWith();
  const conversation = ChatConversationListUtil.conversationsOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker).find((candidate) => candidate.key === key);
  if (conversation === undefined) throw new Error(`No fixture conversation ${key}`);
  return conversation;
}

test('New spar posts the spar mode to the product owner route with the launch token', async () => {
  receivedRequests.length = 0;
  expect(await startSparringProductOwner('tracker-example-notes', sendToMockServer)).toEqual({ kind: 'sent' });
  expect(receivedRequests).toEqual([{
    method: 'POST', path: '/api/projects/tracker-example-notes/product-owner', token: 'token-example', body: { mode: 'spar' }
  }]);
});

test('each quick prompt reaches the product owner messages route as exactly its text', async () => {
  receivedRequests.length = 0;
  const conversation = conversationOf('product-owner:tracker-example-agency-site');
  for (const prompt of QUICK_PROMPTS) {
    expect(await sendToConversation(conversation, prompt, sendToMockServer)).toEqual({ kind: 'sent' });
  }
  expect(receivedRequests.map((request) => request.path)).toEqual(QUICK_PROMPTS.map(() => '/api/projects/tracker-example-agency-site/product-owner/messages'));
  expect(receivedRequests.map((request) => request.body)).toEqual(QUICK_PROMPTS.map((prompt) => ({ text: prompt, sessionId: 'product-owner-idle' })));
  expect(QUICK_PROMPTS).toEqual(['Challenge this', 'What am I missing?', 'Summarise the table', 'Wrap up into tickets']);
});

test('a watched desktop orchestrator takes its message through the orchestrator route, named by its session', async () => {
  receivedRequests.length = 0;
  await sendToConversation(conversationOf('watched:tracker-example-mobile-app:watched-example'), 'Challenge this', sendToMockServer);
  expect(receivedRequests).toEqual([{
    method: 'POST', path: '/api/projects/tracker-example-mobile-app/orchestrator/messages', token: 'token-example', body: { text: 'Challenge this', sessionId: 'watched-example' }
  }]);
});
