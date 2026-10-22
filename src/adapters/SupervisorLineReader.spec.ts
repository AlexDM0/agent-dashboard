/**
 * A supervisor acts on whatever a connected client writes, so only the three request shapes may read as requests; and a
 * server takes a session's state from the state line alone, so a session line or a damaged record must read as null.
 */
import { expect, test } from 'bun:test';

import { supervisorRequestOf, supervisorStateOf } from './SupervisorLineReader.ts';

const EXAMPLE_RECORD = {
  trackerId:         'example-tracker',
  root:              '/Users/alex.example/development/example-agency',
  supervisorPid:     4100,
  sessionPid:        4101,
  sessionId:         '00000000-0000-4000-8000-000000000001',
  socketPath:        '/tmp/example.sock',
  claudeCodeVersion: '9.9.9',
  startedAt:         '2026-10-22T10:00:00.000Z',
};

test('chat, answer and stop read as requests, and nothing else does', () => {
  expect(supervisorRequestOf('{"kind":"chat","text":"Hello from Alex Example"}')).toEqual({ kind: 'chat', text: 'Hello from Alex Example' });
  expect(supervisorRequestOf('{"kind":"answer","requestId":"request-1","answers":{"Which colour?":"Red"}}'))
    .toEqual({ kind: 'answer', requestId: 'request-1', answers: { 'Which colour?': 'Red' } });
  expect(supervisorRequestOf('{"kind":"stop"}')).toEqual({ kind: 'stop' });
  expect(supervisorRequestOf('{"kind":"chat","text":7}')).toBeNull();
  expect(supervisorRequestOf('{"kind":"answer","requestId":"request-1","answers":{"Which colour?":1}}')).toBeNull();
  expect(supervisorRequestOf('{"kind":"shutdown"}')).toBeNull();
  expect(supervisorRequestOf('not json')).toBeNull();
});

test('a state line reads with its record, and a session line or a damaged record reads as null', () => {
  const stateLine = JSON.stringify({
    kind: 'state', record: EXAMPLE_RECORD, state: 'busy', context: null, pendingQuestions: []
  });
  expect(supervisorStateOf(stateLine)).toEqual({
    kind: 'state', record: EXAMPLE_RECORD, state: 'busy', context: null, pendingQuestions: []
  });
  expect(supervisorStateOf(JSON.stringify({ kind: 'session', line: '{}' }))).toBeNull();
  expect(supervisorStateOf(JSON.stringify({ kind: 'state', record: { ...EXAMPLE_RECORD, sessionPid: 0 }, state: 'busy' }))).toBeNull();
  expect(supervisorStateOf(JSON.stringify({ kind: 'state', record: EXAMPLE_RECORD, state: 'asleep' }))).toBeNull();
});
