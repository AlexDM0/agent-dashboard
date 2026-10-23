/**
 * The stdout lines of one `claude -p --output-format stream-json` session to the chat messages they show: an
 * `assistant` line's text blocks as assistant turns and its `tool_use` blocks as tool calls, in their order; a `user`
 * line's `tool_result` blocks as their calls again, joined by id, now carrying the result. Usage and every other line
 * show nothing; a line that does not parse is no message, never a throw.
 */
import type { ChatMessage, ToolCall } from '../shared/DashboardContract.ts';
import { UnknownValueUtil }           from '../shared/UnknownValueUtil.ts';

/** A tool call's input can be a whole file being written; the chat shows its start. */
export const MAXIMUM_TOOL_CALL_TEXT_CHARACTERS = 2_000;
/** A tool result can be a whole file read; the chat shows its start. */
export const MAXIMUM_TOOL_RESULT_CHARACTERS = 4_000;

export interface SessionChatMessageMapper {
  chatMessagesOfSessionLine(lineText: string, at: string): ChatMessage[];
}

function cutToBound(text: string, maximumCharacters: number): string {
  return text.length > maximumCharacters ? `${text.slice(0, maximumCharacters)}…` : text;
}

function callLineOf(toolCall: ToolCall): string {
  return toolCall.inputSummary.length === 0 ? toolCall.toolName : `${toolCall.toolName} ${toolCall.inputSummary}`;
}

function toolMessageOf(toolCall: ToolCall, at: string): ChatMessage {
  return {
    at, role: 'tool', text: callLineOf(toolCall), toolCall
  };
}

function toolCallOfUseBlock(block: Record<string, unknown>, fallbackCallId: string): ToolCall {
  return {
    callId:       typeof block['id'] === 'string' ? block['id'] : fallbackCallId,
    toolName:     typeof block['name'] === 'string' ? block['name'] : 'tool',
    inputSummary: block['input'] === undefined ? '' : cutToBound(JSON.stringify(block['input']), MAXIMUM_TOOL_CALL_TEXT_CHARACTERS),
    result:       null,
  };
}

/** A result's content is a string or a list of blocks, of which only the text ones read as text. */
function resultTextOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => UnknownValueUtil.isJsonObject(block) && block['type'] === 'text' && typeof block['text'] === 'string')
    .map((block) => String((block as Record<string, unknown>)['text']))
    .join('\n');
}

function contentBlocksOf(line: unknown, lineType: string): unknown[] {
  if (!UnknownValueUtil.isJsonObject(line) || line['type'] !== lineType || !UnknownValueUtil.isJsonObject(line['message'])) return [];
  const { content } = line['message'];
  return Array.isArray(content) ? content : [];
}

function parsedLineOf(lineText: string): unknown {
  try {
    return JSON.parse(lineText);
  } catch {
    return null;
  }
}

/** Holds each call until its result arrives, so the result is shown beside the call it answers. */
export function createSessionChatMessageMapper(): SessionChatMessageMapper {
  const awaitedCallsById = new Map<string, ToolCall>();
  let unnamedCallCount = 0;

  function assistantMessagesOf(blocks: unknown[], at: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const block of blocks) {
      if (!UnknownValueUtil.isJsonObject(block)) continue;
      if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim().length > 0) messages.push({ at, role: 'assistant', text: block['text'] });
      if (block['type'] === 'tool_use') {
        unnamedCallCount += 1;
        const toolCall = toolCallOfUseBlock(block, `unnamed-call-${unnamedCallCount}`);
        awaitedCallsById.set(toolCall.callId, toolCall);
        messages.push(toolMessageOf(toolCall, at));
      }
    }
    return messages;
  }

  function resultMessagesOf(blocks: unknown[], at: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const block of blocks) {
      if (!UnknownValueUtil.isJsonObject(block) || block['type'] !== 'tool_result' || typeof block['tool_use_id'] !== 'string') continue;
      const awaitedCall = awaitedCallsById.get(block['tool_use_id']);
      if (awaitedCall === undefined) continue;
      awaitedCallsById.delete(awaitedCall.callId);
      messages.push(toolMessageOf({ ...awaitedCall, result: cutToBound(resultTextOf(block['content']), MAXIMUM_TOOL_RESULT_CHARACTERS) }, at));
    }
    return messages;
  }

  function chatMessagesOfSessionLine(lineText: string, at: string): ChatMessage[] {
    const line = parsedLineOf(lineText);
    return [...assistantMessagesOf(contentBlocksOf(line, 'assistant'), at), ...resultMessagesOf(contentBlocksOf(line, 'user'), at)];
  }

  return { chatMessagesOfSessionLine };
}
