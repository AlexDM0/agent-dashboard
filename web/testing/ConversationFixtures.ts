import type { ChatMessage, ToolCall } from '../../src/shared/DashboardContract.ts';

const AT = '2026-10-23T10:00:00.000Z';

function toolMessageOf(toolCall: ToolCall): ChatMessage {
  return {
    at: AT, role: 'tool', text: `${toolCall.toolName} ${toolCall.inputSummary}`, toolCall
  };
}

const READ_CALL: ToolCall = {
  callId: 'call-read', toolName: 'Read', inputSummary: '{"file_path":"/example/notes.md"}', result: null
};
const STATUS_CALL: ToolCall = {
  callId: 'call-status', toolName: 'Bash', inputSummary: '{"command":"agent-progress status --json"}', result: null
};
const LIST_CALL: ToolCall = {
  callId: 'call-list', toolName: 'Bash', inputSummary: '{"command":"ls"}', result: null
};

/** A turn, a run of three calls of which two answer (one after the reply), a Markdown reply, then an older-shape call. */
export const FIXTURE_CONVERSATION: ChatMessage[] = [
  { at: AT, role: 'user', text: 'What is on the board for Example Agency?' },
  { at: AT, role: 'assistant', text: 'Reading the board.' },
  toolMessageOf(READ_CALL),
  toolMessageOf(STATUS_CALL),
  toolMessageOf(LIST_CALL),
  toolMessageOf({ ...STATUS_CALL, result: '{"readyTickets":["055"]}' }),
  {
    at:   AT,
    role: 'assistant',
    text: [
      '| Ticket | State |',
      '| --- | --- |',
      '| #055 | ready |',
      '',
      '- [x] read the board',
      '- [ ] build #055',
      '',
      '```',
      'agent-progress status --json',
      '```',
      '',
      'See [the board](https://example.com/board). <script>alert(1)</script> <b>bold</b>',
    ].join('\n'),
  },
  toolMessageOf({ ...READ_CALL, result: '# Notes for Alex Example' }),
  { at: AT, role: 'tool', text: 'Bash {"command":"pwd"}' },
];
