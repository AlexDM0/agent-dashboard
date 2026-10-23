import type { ChatMessage } from '../../src/shared/DashboardContract.ts';

/** `unrecorded` is a call from history written before calls carried their result. */
export type ToolCallProgress = 'running' | 'answered' | 'unrecorded';

export interface ShownToolCall {
  callId:       string | null;
  toolName:     string;
  inputSummary: string;
  progress:     ToolCallProgress;
  result:       string;  // empty unless answered
}

interface ToolCallsItem { kind: 'tool-calls'; key: number; calls: ShownToolCall[] }

export type ConversationItem = { kind: 'turn'; key: number; message: ChatMessage } | ToolCallsItem;

function shownToolCallOf(message: ChatMessage): ShownToolCall {
  const { toolCall } = message;
  if (toolCall === undefined) {
    const [toolName = 'tool', ...inputWords] = message.text.split(' ');
    return {
      callId: null, toolName, inputSummary: inputWords.join(' '), progress: 'unrecorded', result: ''
    };
  }
  return {
    callId:       toolCall.callId,
    toolName:     toolCall.toolName,
    inputSummary: toolCall.inputSummary,
    progress:     toolCall.result === null ? 'running' : 'answered',
    result:       toolCall.result ?? '',
  };
}

/**
 * Text turns stay items of their own; every run of tool messages between two turns is one item. A later message for a
 * call already shown, its result arriving, replaces that call where it stands rather than adding one.
 */
function itemsOf(messages: ChatMessage[]): ConversationItem[] {
  const items: ConversationItem[] = [];
  const shownCallPlaces = new Map<string, { calls: ShownToolCall[]; callIndex: number }>();
  messages.forEach((message, index) => {
    if (message.role !== 'tool') {
      items.push({ kind: 'turn', key: index, message });
      return;
    }
    const call = shownToolCallOf(message);
    const shownPlace = call.callId === null ? undefined : shownCallPlaces.get(call.callId);
    if (shownPlace !== undefined) {
      shownPlace.calls[shownPlace.callIndex] = call;
      return;
    }
    const lastItem = items.at(-1);
    const group: ToolCallsItem = lastItem?.kind === 'tool-calls' ? lastItem : { kind: 'tool-calls', key: index, calls: [] };
    if (group !== lastItem) items.push(group);
    if (call.callId !== null) shownCallPlaces.set(call.callId, { calls: group.calls, callIndex: group.calls.length });
    group.calls.push(call);
  });
  return items;
}

function groupLabelOf(callCount: number): string {
  return callCount === 1 ? 'Used 1 tool' : `Used ${callCount} tools`;
}

export const ConversationItemUtil = Object.freeze({ itemsOf, shownToolCallOf, groupLabelOf });
