/**
 * The chat window's requests against a scratch mock server on a loopback port (A3, A4): "Spar first" posts
 * `{ "mode": "spar" }` and "File tickets" `{ "mode": "file" }` to the product owner's route; a message goes through its
 * session's own messages route as exactly its text and an answer through the answers route, each carrying the launch
 * token; a watched session's message names its session.
 */
import { afterAll, expect, test } from 'bun:test';

import { chatSnapshotWith }                                            from '../testing/SnapshotFixtures.ts';
import { ChatConversationListUtil }                                    from './ChatConversationListUtil.ts';
import { answerConversation, sendToConversation, startProductOwnerIn } from './ChatOverlayRequests.ts';

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

test('"Spar first" posts the spar mode and "File tickets" the file mode to the product owner route with the launch token', async () => {
  receivedRequests.length = 0;
  expect(await startProductOwnerIn('tracker-example-notes', 'spar', sendToMockServer)).toEqual({ kind: 'sent' });
  expect(await startProductOwnerIn('tracker-example-notes', 'file', sendToMockServer)).toEqual({ kind: 'sent' });
  expect(receivedRequests).toEqual([
    {
      method: 'POST', path: '/api/projects/tracker-example-notes/product-owner', token: 'token-example', body: { mode: 'spar' }
    },
    {
      method: 'POST', path: '/api/projects/tracker-example-notes/product-owner', token: 'token-example', body: { mode: 'file' }
    },
  ]);
});

test('a message reaches the product owner messages route as exactly its text, named by its session', async () => {
  receivedRequests.length = 0;
  expect(await sendToConversation(conversationOf('product-owner:tracker-example-agency-site'), 'What am I missing?', sendToMockServer)).toEqual({ kind: 'sent' });
  expect(receivedRequests).toEqual([{
    method: 'POST',
    path:   '/api/projects/tracker-example-agency-site/product-owner/messages',
    token:  'token-example',
    body:   { text: 'What am I missing?', sessionId: 'product-owner-idle' },
  }]);
});

test('an answer reaches its role\'s answers route as the request it was given', async () => {
  receivedRequests.length = 0;
  const answerRequest = { requestId: 'request-product-owner', answers: { 'Example question request-product-owner?': 'Yes' } };
  expect(await answerConversation(conversationOf('product-owner:tracker-example-storefront'), answerRequest, sendToMockServer)).toEqual({ kind: 'sent' });
  expect(receivedRequests).toEqual([{
    method: 'POST', path: '/api/projects/tracker-example-storefront/product-owner/answers', token: 'token-example', body: answerRequest
  }]);
});

test('a watched desktop orchestrator takes its message through the orchestrator route, named by its session', async () => {
  receivedRequests.length = 0;
  await sendToConversation(conversationOf('watched:tracker-example-mobile-app:watched-example'), 'Challenge this', sendToMockServer);
  expect(receivedRequests).toEqual([{
    method: 'POST', path: '/api/projects/tracker-example-mobile-app/orchestrator/messages', token: 'token-example', body: { text: 'Challenge this', sessionId: 'watched-example' }
  }]);
});
