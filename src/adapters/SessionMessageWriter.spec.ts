/**
 * The wire format is the whole contract with the receiving session: exactly one JSON line of a user message, then the
 * connection closes. A probe writes nothing, and a socket nobody listens on is a failure verdict, never a throw.
 */
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { type ExampleSessionListener, listenAsExampleSession }             from '../testing/ExampleClaudeSessions.ts';
import { createScratchDirectory, removeScratchDirectory }                  from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                       from '../testing/WaitUntil.ts';
import { sessionMessageLineOf, sessionSocketAccepts, writeSessionMessage } from './SessionMessageWriter.ts';

const SOCKET_TIMEOUT_MILLISECONDS = 1_000;

let scratchDirectory = '';
let listener: ExampleSessionListener;

beforeEach(() => {
  scratchDirectory = createScratchDirectory('writer');
  listener = listenAsExampleSession(scratchDirectory, 'session');
});

afterEach(() => {
  listener.stop();
  removeScratchDirectory(scratchDirectory);
});

test('a message is exactly one NDJSON user-message line', async () => {
  const text = 'Example "quoted" message\nfrom Alex Example';
  expect(await writeSessionMessage(listener.socketPath, text, SOCKET_TIMEOUT_MILLISECONDS)).toEqual({ kind: 'delivered' });
  await waitUntil(() => listener.receivedText().endsWith('\n'), 'the line arrives');
  expect(listener.receivedText()).toBe(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
});

test('a line longer than one socket write arrives whole before it counts as delivered', async () => {
  const text = 'Example long message from Alex Example. '.repeat(25_000);
  expect(await writeSessionMessage(listener.socketPath, text, SOCKET_TIMEOUT_MILLISECONDS)).toEqual({ kind: 'delivered' });
  await waitUntil(() => listener.receivedText().endsWith('\n'), 'the whole line arrives');
  expect(listener.receivedText()).toBe(sessionMessageLineOf(text));
});

test('a probe connects and writes nothing', async () => {
  expect(await sessionSocketAccepts(listener.socketPath, SOCKET_TIMEOUT_MILLISECONDS)).toBe(true);
  await waitUntil(() => listener.connectionCount() === 1, 'the probe connects');
  expect(listener.receivedText()).toBe('');
});

test('a socket nobody listens on fails as a verdict', async () => {
  const missingSocketPath = join(scratchDirectory, 'nobody.sock');
  expect(await sessionSocketAccepts(missingSocketPath, SOCKET_TIMEOUT_MILLISECONDS)).toBe(false);
  const verdict = await writeSessionMessage(missingSocketPath, 'Example message', SOCKET_TIMEOUT_MILLISECONDS);
  expect(verdict.kind).toBe('failed');
});
