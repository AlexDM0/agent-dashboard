#!/usr/bin/env bun
// Stands in for `claude -p` in stream-json (AGENT_DASHBOARD_CLAUDE) so the README shows a crew without a real session: it plays a
// scripted conversation for the role its first message names, one turn per user line: an orchestrator that reads the board and
// then, asked about the checkout, ends on a pending AskUserQuestion; a product owner that files the ticket it is told about.
// It exits once its stdin closes.

const MODEL = 'claude-opus-5-5';
const CONTEXT_WINDOW_TOKENS = 200_000;
const PAUSE_BETWEEN_LINES_MILLISECONDS = 40;

const print = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);
const pause = () => Bun.sleep(PAUSE_BETWEEN_LINES_MILLISECONDS);

function usageOf(usedTokens) {
  return { input_tokens: 6, cache_read_input_tokens: usedTokens - 1_206, cache_creation_input_tokens: 1_200, output_tokens: 412 };
}

let callCount = 0;
async function say(usedTokens, text) {
  print({ type: 'assistant', message: { model: MODEL, usage: usageOf(usedTokens), content: [{ type: 'text', text }] } });
  await pause();
}

async function run(usedTokens, toolName, input, result) {
  callCount += 1;
  const callId = `toolu_example_${callCount}`;
  print({ type: 'assistant', message: { model: MODEL, usage: usageOf(usedTokens), content: [{ type: 'tool_use', id: callId, name: toolName, input }] } });
  await pause();
  print({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: callId, content: result }] } });
  await pause();
}

function endTurn() {
  print({ type: 'result', subtype: 'success', modelUsage: { [MODEL]: { contextWindow: CONTEXT_WINDOW_TOKENS } } });
}

async function ask(usedTokens, question) {
  callCount += 1;
  const input = { questions: [question] };
  print({ type: 'assistant', message: { model: MODEL, usage: usageOf(usedTokens), content: [{ type: 'tool_use', id: `toolu_example_${callCount}`, name: 'AskUserQuestion', input }] } });
  await pause();
  print({
    type:       'control_request',
    request_id: `example-question-${callCount}`,
    request:    { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input, requires_user_interaction: true },
  });
}

const ORCHESTRATOR_TURNS = [
  async () => {
    await run(98_400, 'Bash', { command: 'agent-progress status', description: 'Read the board' },
      'Example Storefront: 16 tickets — 2 delivered, 1 reviewed, 1 in review, 2 building, 9 pending, 1 abandoned\n'
      + 'Dispatcher: running (wf_example-0001), 3 of 3 slots busy\n'
      + 'Next: no slot free (3 agents in flight); ready: #016');
    await say(104_900, 'The run is at full capacity. Building: #004 Account pages dark mode and #010 Stale basket badge. '
      + 'Reviewing: #008 Rate-limit resets, round 1. #003 Accent-blind search is approved and waits for its reviewer to rebase before release.');
    endTurn();
  },
  async () => {
    await run(109_200, 'Bash', { command: 'agent-progress ticket show 12', description: 'Check what #012 waits on' },
      '#012 One-page checkout — pending, normal\nEpic: Checkout redesign\nWaits on: #001 (delivered), #004 (building), #011 (waits on #008)');
    await say(126_300, '#012 One-page checkout is the bottleneck of Checkout redesign: it frees #013 and #014, '
      + 'and it can start once #004 and #011 are delivered.');
    await ask(131_700, {
      question:    '#013 Express checkout button and #014 Reorder from order history are low priority and wait on #012. Should the run pick them up as soon as #012 is delivered?',
      header:      'Low tickets',
      multiSelect: false,
      options:     [
        { label: 'Pick them up', description: 'The run builds #013 and #014 right after #012, ahead of new normal tickets.' },
        { label: 'Hold them', description: 'They wait until User clears them on the dashboard.' },
      ],
    });
  },
  async () => {
    await say(134_100, 'Noted. I will tell the dispatcher at its next agent return.');
    endTurn();
  },
];

const PRODUCT_OWNER_TURNS = [
  async () => {
    await run(31_800, 'Bash', { command: 'agent-progress status --json', description: 'Read the board before filing' }, '{"project":"Example Storefront","tickets":16}');
    await say(33_400, 'I have read the Example Storefront board: 16 tickets, two epics. What should the next ticket cover?');
    endTurn();
  },
  async () => {
    await say(36_900, 'A size preference fits Customer account. Before I file it: a remembered size should preselect on product pages only, '
      + 'never change the basket. I will file it as normal priority, waiting on nothing.');
    const filedTicket = fileTicket('Remember a customer\'s size', 'customer-account');
    await run(38_200, 'Bash', { command: filedTicket.command, description: 'File the agreed ticket' }, filedTicket.output);
    await say(39_600, 'Filed #017 Remember a customer\'s size under Customer account. It is ready to build.');
    endTurn();
  },
];

// The product owner really files its ticket, in the demo repository it was started in, so the board shows it.
function fileTicket(title, epic) {
  const body = `## Report\n\nCustomers re-pick their size on every product page.\n\n## Wanted\n\n${title}.\n\n## Acceptance\n\nA1. ${title} works as described.\n`;
  const commandArguments = ['ticket', 'add', title, '--type', 'ticket', '--epic', epic, '--body', body];
  const filing = Bun.spawnSync(['agent-progress', ...commandArguments], { stdout: 'pipe', stderr: 'pipe' });
  return {
    command: `agent-progress ticket add "${title}" --type ticket --epic ${epic} --body "…"`,
    output:  `${filing.stdout.toString()}${filing.stderr.toString()}`.trim(),
  };
}

let turns = null;
let nextTurnIndex = 0;
for await (const line of console) {
  let parsed = null;
  try {
    parsed = JSON.parse(line);
  } catch {
    continue;
  }
  if (parsed?.type !== 'user' && parsed?.type !== 'control_response') continue;
  if (turns === null) {
    const firstMessage = String(parsed.message?.content ?? '');
    turns = firstMessage.includes('/agent-po') ? PRODUCT_OWNER_TURNS : ORCHESTRATOR_TURNS;
    print({ type: 'system', subtype: 'init', claude_code_version: '2.1.308', permissionMode: 'auto', model: MODEL });
  }
  const turn = turns[nextTurnIndex];
  nextTurnIndex += 1;
  if (turn) await turn();
  else endTurn();
}
process.exit(0);
