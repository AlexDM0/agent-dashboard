/**
 * The chat shows what the session said and which tools it called, in the order of the line's blocks, and nothing it
 * cannot read: a tool call's input is cut to a bound, and usage-only, result, tool-result or damaged lines show nothing.
 */
import { expect, test } from 'bun:test';

import { MAXIMUM_TOOL_CALL_TEXT_CHARACTERS, chatMessagesOfSessionLine } from './SessionChatMessageMapper.ts';

const AT = '2026-10-22T10:00:00.000Z';

test('an assistant line shows its text and tool calls in block order', () => {
  const line = JSON.stringify({
    type:    'assistant',
    message: {
      model:   'example-model',
      content: [
        { type: 'text', text: 'Reading the board for Alex Example.' },
        {
          type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'agent-progress status --json' }
        },
        { type: 'text', text: '   ' },
        { type: 'thinking', thinking: 'not shown' },
      ],
    },
  });
  expect(chatMessagesOfSessionLine(line, AT)).toEqual([
    { at: AT, role: 'assistant', text: 'Reading the board for Alex Example.' },
    { at: AT, role: 'tool', text: 'Bash {"command":"agent-progress status --json"}' },
  ]);
});

test('a tool call with a long input is cut to the bound', () => {
  const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { content: 'x'.repeat(5_000) } }] } });
  const [message] = chatMessagesOfSessionLine(line, AT);
  expect(message?.text.length).toBe(MAXIMUM_TOOL_CALL_TEXT_CHARACTERS + 1);
  expect(message?.text.endsWith('…')).toBe(true);
});

test('result, user tool-result, usage-only and damaged lines show nothing', () => {
  expect(chatMessagesOfSessionLine(JSON.stringify({ type: 'result', subtype: 'success', result: 'Done' }), AT)).toEqual([]);
  expect(chatMessagesOfSessionLine(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }), AT)).toEqual([]);
  expect(chatMessagesOfSessionLine(JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1 } } }), AT)).toEqual([]);
  expect(chatMessagesOfSessionLine('not json', AT)).toEqual([]);
});
