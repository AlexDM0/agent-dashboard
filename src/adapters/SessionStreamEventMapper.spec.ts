/**
 * The supervisor acts on four kinds of stream-json line, so each must map to its event with the fields it needs (the
 * used tokens summed over the three input counts, every model's context window, the questions of an AskUserQuestion),
 * any other permission prompt must read as one to deny, and a line that is not JSON or not known must be `other`.
 */
import { expect, test } from 'bun:test';

import { sessionStreamEventOf } from './SessionStreamEventMapper.ts';

const EXAMPLE_QUESTION = {
  question:    'Which colour should the example use?',
  header:      'Colour',
  multiSelect: false,
  options:     [{ label: 'Red', description: 'The warm one' }, { label: 'Blue', description: 'The cool one' }],
};

test('an init line carries the Claude Code version', () => {
  expect(sessionStreamEventOf('{"type":"system","subtype":"init","claude_code_version":"9.9.9"}')).toEqual({ kind: 'init', claudeCodeVersion: '9.9.9' });
});

test('an assistant line\'s used tokens are its input, cache read and cache creation tokens, without the output', () => {
  const line = JSON.stringify({
    type:    'assistant',
    message: {
      model: 'example-model',
      usage: {
        input_tokens: 2, cache_read_input_tokens: 100, cache_creation_input_tokens: 30, output_tokens: 999
      }
    },
  });
  expect(sessionStreamEventOf(line)).toEqual({ kind: 'assistant-usage', usedTokens: 132, model: 'example-model' });
});

test('a result line carries the context window of every model it used', () => {
  const line = JSON.stringify({ type: 'result', modelUsage: { 'example-model': { contextWindow: 200_000 }, 'other-model': { inputTokens: 1 } } });
  expect(sessionStreamEventOf(line)).toEqual({ kind: 'result', contextWindowTokensByModel: { 'example-model': 200_000 } });
});

test('an AskUserQuestion permission request is a question carrying its input and its questions', () => {
  const input = { questions: [EXAMPLE_QUESTION] };
  const line = JSON.stringify({ type: 'control_request', request_id: 'request-1', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input } });
  expect(sessionStreamEventOf(line)).toEqual({
    kind: 'question', requestId: 'request-1', input, questions: [EXAMPLE_QUESTION]
  });
});

test('any other tool\'s permission request is one to deny', () => {
  const line = JSON.stringify({ type: 'control_request', request_id: 'request-2', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'true' } } });
  expect(sessionStreamEventOf(line)).toEqual({ kind: 'permission-request', requestId: 'request-2' });
});

test('a line that is not JSON, or of a type the supervisor does not act on, is other', () => {
  expect(sessionStreamEventOf('not json')).toEqual({ kind: 'other' });
  expect(sessionStreamEventOf('{"type":"user"}')).toEqual({ kind: 'other' });
  expect(sessionStreamEventOf('{"type":"assistant","message":{}}')).toEqual({ kind: 'other' });
});
