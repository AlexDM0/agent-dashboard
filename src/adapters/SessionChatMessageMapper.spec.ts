/**
 * The chat shows what the session said and which tools it called, in the order of the line's blocks, and nothing it
 * cannot read: a tool call's input and result are cut to bounds, and a result reaches the chat joined to its call by
 * the `tool_use` id, whenever it arrives, while usage-only, result, unmatched and damaged lines show nothing.
 */
import { expect, test } from 'bun:test';

import { MAXIMUM_TOOL_CALL_TEXT_CHARACTERS, MAXIMUM_TOOL_RESULT_CHARACTERS, createSessionChatMessageMapper } from './SessionChatMessageMapper.ts';

const AT = '2026-10-22T10:00:00.000Z';
const LATER = '2026-10-22T10:00:05.000Z';

function assistantLine(content: unknown[]): string {
  return JSON.stringify({ type: 'assistant', message: { model: 'example-model', content } });
}

function toolResultLine(content: unknown[]): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content } });
}

test('an assistant line shows its text and tool calls in block order, each call awaiting its result', () => {
  const line = assistantLine([
    { type: 'text', text: 'Reading the board for Alex Example.' },
    {
      type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'agent-progress status --json' }
    },
    { type: 'text', text: '   ' },
    { type: 'thinking', thinking: 'not shown' },
  ]);
  expect(createSessionChatMessageMapper().chatMessagesOfSessionLine(line, AT)).toEqual([
    { at: AT, role: 'assistant', text: 'Reading the board for Alex Example.' },
    {
      at:       AT,
      role:     'tool',
      text:     'Bash {"command":"agent-progress status --json"}',
      toolCall: {
        callId: 'tool-1', toolName: 'Bash', inputSummary: '{"command":"agent-progress status --json"}', result: null
      },
    },
  ]);
});

test('two calls each take their own result by id, one result arriving a line later than the other', () => {
  const mapper = createSessionChatMessageMapper();
  mapper.chatMessagesOfSessionLine(assistantLine([
    {
      type: 'tool_use', id: 'call-read', name: 'Read', input: { file_path: '/example/notes.md' }
    },
    {
      type: 'tool_use', id: 'call-list', name: 'Bash', input: { command: 'ls' }
    },
  ]), AT);
  const firstResults = mapper.chatMessagesOfSessionLine(toolResultLine([{ type: 'tool_result', tool_use_id: 'call-list', content: 'notes.md' }]), AT);
  const laterResults = mapper.chatMessagesOfSessionLine(toolResultLine([
    { type: 'tool_result', tool_use_id: 'call-read', content: [{ type: 'text', text: '# Notes' }, { type: 'image', source: {} }] },
  ]), LATER);
  expect(firstResults.map((message) => message.toolCall)).toEqual([{
    callId: 'call-list', toolName: 'Bash', inputSummary: '{"command":"ls"}', result: 'notes.md'
  }]);
  expect(laterResults).toEqual([{
    at:       LATER,
    role:     'tool',
    text:     'Read {"file_path":"/example/notes.md"}',
    toolCall: {
      callId: 'call-read', toolName: 'Read', inputSummary: '{"file_path":"/example/notes.md"}', result: '# Notes'
    },
  }]);
});

test('a result for a call it never saw, or a second result for one, shows nothing', () => {
  const mapper = createSessionChatMessageMapper();
  mapper.chatMessagesOfSessionLine(assistantLine([{
    type: 'tool_use', id: 'call-1', name: 'Bash', input: {}
  }]), AT);
  const resultLine = toolResultLine([{ type: 'tool_result', tool_use_id: 'call-1', content: 'ok' }]);
  expect(mapper.chatMessagesOfSessionLine(resultLine, AT)).toHaveLength(1);
  expect(mapper.chatMessagesOfSessionLine(resultLine, AT)).toEqual([]);
  expect(mapper.chatMessagesOfSessionLine(toolResultLine([{ type: 'tool_result', tool_use_id: 'unknown', content: 'ok' }]), AT)).toEqual([]);
});

test('a tool call with a long input and a long result are each cut to their bound', () => {
  const mapper = createSessionChatMessageMapper();
  const [call] = mapper.chatMessagesOfSessionLine(assistantLine([{
    type: 'tool_use', id: 'call-write', name: 'Write', input: { content: 'x'.repeat(5_000) }
  }]), AT);
  const [answered] = mapper.chatMessagesOfSessionLine(toolResultLine([{ type: 'tool_result', tool_use_id: 'call-write', content: 'y'.repeat(9_000) }]), AT);
  expect(call?.toolCall?.inputSummary.length).toBe(MAXIMUM_TOOL_CALL_TEXT_CHARACTERS + 1);
  expect(call?.toolCall?.inputSummary.endsWith('…')).toBe(true);
  expect(answered?.toolCall?.result?.length).toBe(MAXIMUM_TOOL_RESULT_CHARACTERS + 1);
  expect(answered?.toolCall?.result?.endsWith('…')).toBe(true);
});

test('result, user text, usage-only and damaged lines show nothing', () => {
  const mapper = createSessionChatMessageMapper();
  expect(mapper.chatMessagesOfSessionLine(JSON.stringify({ type: 'result', subtype: 'success', result: 'Done' }), AT)).toEqual([]);
  expect(mapper.chatMessagesOfSessionLine(toolResultLine([{ type: 'text', text: 'Alex Example wrote this' }]), AT)).toEqual([]);
  expect(mapper.chatMessagesOfSessionLine(JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1 } } }), AT)).toEqual([]);
  expect(mapper.chatMessagesOfSessionLine('not json', AT)).toEqual([]);
});
