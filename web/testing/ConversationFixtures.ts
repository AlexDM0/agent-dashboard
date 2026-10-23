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

/** A table in the shape `.agent-progress/evidence/043-table-protocol.md` recommends: a point in each state, one draft, three references. */
export const FIXTURE_SPAR_TABLE = {
  points: [
    { id: 'p1', text: 'Export the invoice lines to CSV', state: 'agreed' },
    { id: 'p2', text: 'Which columns the totals row keeps', state: 'open' },
    { id: 'p3', text: 'A PDF export', state: 'parked' },
  ],
  draftTickets: [{
    key: 'd1', title: 'Export invoice line items to CSV', type: 'ticket', summary: 'One CSV per invoice for Example Agency.'
  }],
  referencedTicketIds: ['043', '040', '047'],
};

function sparTableFenceOf(tableJson: string): string {
  return ['```spar-table', tableJson, '```'].join('\n');
}

/** A sparring product owner's conversation: the brief, the user's opening, a reply with markup and a table, then a reply whose table is broken. */
export const FIXTURE_SPARRING_CONVERSATION: ChatMessage[] = [
  { at: AT, role: 'user', text: 'The project is example-invoices. You are this project\'s product owner. This is a sparring session: file nothing until the user says "wrap up".' },
  { at: AT, role: 'user', text: 'CSV export for invoices\nand maybe PDF later?' },
  { at: AT, role: 'assistant', text: `Agreed on CSV. <img src=x onerror=alert(1)> stays text.\n\n${sparTableFenceOf(JSON.stringify(FIXTURE_SPAR_TABLE))}` },
  { at: AT, role: 'assistant', text: `Parking PDF.\n\n${sparTableFenceOf('{"points":[{"id":"p1","text":"x","state":"done"}],"draftTickets":[],"referencedTicketIds":[]}')}` },
];

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
