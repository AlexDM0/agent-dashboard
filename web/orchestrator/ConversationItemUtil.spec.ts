/**
 * A run of tool calls between two text turns is one item, so the chat shows it as one line; a call's later message,
 * its result, replaces the call where it stands even after a turn came between, never adding a call; a call from
 * history before calls carried fields still shows, its result unrecorded.
 */
import { expect, test } from 'bun:test';

import { FIXTURE_CONVERSATION } from '../testing/ConversationFixtures.ts';
import { ConversationItemUtil } from './ConversationItemUtil.ts';

test('turns stay their own items and each run of calls is one item, results folded into their calls', () => {
  const items = ConversationItemUtil.itemsOf(FIXTURE_CONVERSATION);
  expect(items.map((item) => item.kind)).toEqual(['turn', 'turn', 'tool-calls', 'turn', 'tool-calls']);
  const [, , firstRun, , secondRun] = items;
  expect(firstRun?.kind === 'tool-calls' && firstRun.calls.map((call) => [call.callId, call.progress, call.result])).toEqual([
    ['call-read', 'answered', '# Notes for Alex Example'],
    ['call-status', 'answered', '{"readyTickets":["055"]}'],
    ['call-list', 'running', ''],
  ]);
  expect(secondRun?.kind === 'tool-calls' && secondRun.calls).toEqual([{
    callId: null, toolName: 'Bash', inputSummary: '{"command":"pwd"}', progress: 'unrecorded', result: ''
  }]);
});

test('a group label counts its calls in the singular for one', () => {
  expect(ConversationItemUtil.groupLabelOf(1)).toBe('Used 1 tool');
  expect(ConversationItemUtil.groupLabelOf(3)).toBe('Used 3 tools');
});

test('a call message without fields reads its tool name from its line', () => {
  expect(ConversationItemUtil.shownToolCallOf({ at: '2026-10-23T10:00:00.000Z', role: 'tool', text: 'TodoWrite' })).toEqual({
    callId: null, toolName: 'TodoWrite', inputSummary: '', progress: 'unrecorded', result: ''
  });
});
