/**
 * A watched session's usage is read on every snapshot, so the reader must never throw and never read a whole large
 * transcript: the newest real `assistant` usage wins, a missing, malformed or usage-free transcript is `unknown`, a
 * session id that is not a plain file name reads nothing, and a usage line further from the end than the tail bound is
 * not seen, which proves only the tail is read, while one the bound starts exactly on is kept whole. Every transcript lives under a scratch home.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join }                      from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { type ExampleSession, exampleAssistantLine, writeExampleTranscript } from '../testing/ExampleClaudeSessions.ts';
import { createScratchDirectory, removeScratchDirectory }                    from '../testing/ScratchDirectory.ts';
import { readTranscriptUsage }                                               from './TranscriptUsageReader.ts';

const TAIL_BYTES = 65_536;
const LARGE_TRANSCRIPT_FILLER_BYTES = 4_000_000;
const EXAMPLE_MODEL = 'claude-example-1';

let scratchDirectory = '';
let homeDirectory = '';
let session: ExampleSession;

beforeEach(() => {
  scratchDirectory = createScratchDirectory('transcript-usage');
  homeDirectory = join(scratchDirectory, 'home');
  mkdirSync(homeDirectory);
  session = {
    pid: process.pid, sessionId: 'example-session-1', cwd: join(scratchDirectory, 'example.storefront'), messagingSocketPath: '/unused.sock'
  };
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

function readUsage(sessionId = session.sessionId): ReturnType<typeof readTranscriptUsage> {
  return readTranscriptUsage({ homeDirectory, cwd: session.cwd, sessionId }, TAIL_BYTES);
}

function userLine(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

test('the newest assistant line\'s input, cache-read and cache-creation tokens are the used tokens, with its model and stamp', () => {
  writeExampleTranscript(homeDirectory, session, [
    exampleAssistantLine(EXAMPLE_MODEL, {
      input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4
    }, '2026-10-22T10:00:00.000Z'),
    exampleAssistantLine(EXAMPLE_MODEL, {
      input_tokens: 10, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 300, output_tokens: 40
    }, '2026-10-22T10:05:00.000Z'),
    userLine('Example follow-up'),
  ]);
  expect(readUsage()).toEqual({
    kind:  'measured',
    usage: {
      usedTokens: 2_310, contextWindowTokens: null, model: EXAMPLE_MODEL, measuredAt: '2026-10-22T10:05:00.000Z'
    },
  });
});

test('a missing transcript is unknown, never a throw', () => {
  expect(readUsage().kind).toBe('unknown');
});

test('a transcript of malformed lines, synthetic turns and lines without usage is unknown', () => {
  writeExampleTranscript(homeDirectory, session, [
    'not json',
    '{"type":"assistant","message":',
    JSON.stringify({ type: 'assistant', message: { model: EXAMPLE_MODEL } }),
    JSON.stringify({ type: 'assistant', message: { model: EXAMPLE_MODEL, usage: { input_tokens: 'many' } } }),
    exampleAssistantLine('<synthetic>', { input_tokens: 0 }, '2026-10-22T10:00:00.000Z'),
    '[1, 2]',
    userLine('Example question'),
  ]);
  const verdict = readUsage();
  expect(verdict.kind).toBe('unknown');
});

test('a session id that is not a plain file name reads nothing', () => {
  writeExampleTranscript(homeDirectory, session, [exampleAssistantLine(EXAMPLE_MODEL, { input_tokens: 5 }, '2026-10-22T10:00:00.000Z')]);
  expect(readUsage(`../${session.sessionId}`).kind).toBe('unknown');
});

test('a usage line the tail bound starts exactly on is seen whole', () => {
  const usageLine = exampleAssistantLine(EXAMPLE_MODEL, { input_tokens: 11 }, '2026-10-22T10:00:00.000Z');
  const remainingBytes = TAIL_BYTES - usageLine.length - 1;
  const trailingLine = userLine('x'.repeat(remainingBytes - userLine('').length - 1));
  writeExampleTranscript(homeDirectory, session, [userLine('Example earlier line'), usageLine, trailingLine]);
  const verdict = readUsage();
  expect(verdict.kind === 'measured' ? verdict.usage.usedTokens : null).toBe(11);
});

test('a usage line further from the end of a several-MB transcript than the tail bound is not seen, one inside it is', () => {
  const transcriptPath = writeExampleTranscript(homeDirectory, session, [
    exampleAssistantLine(EXAMPLE_MODEL, { input_tokens: 7 }, '2026-10-22T10:00:00.000Z'),
  ]);
  const fillerLine = `${userLine('x'.repeat(1_000))}\n`;
  appendFileSync(transcriptPath, fillerLine.repeat(Math.ceil(LARGE_TRANSCRIPT_FILLER_BYTES / fillerLine.length)));
  expect(readUsage().kind).toBe('unknown');

  appendFileSync(transcriptPath, `${exampleAssistantLine(EXAMPLE_MODEL, { input_tokens: 9 }, '2026-10-22T11:00:00.000Z')}\n${fillerLine}`);
  const verdict = readUsage();
  expect(verdict.kind === 'measured' ? verdict.usage.usedTokens : null).toBe(9);
});
