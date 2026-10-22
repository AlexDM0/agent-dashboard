/**
 * One stdout line of a `claude -p --output-format stream-json` session to the chat messages it shows: an `assistant`
 * line's text blocks as assistant turns and its `tool_use` blocks as tool calls, in their order. Tool results, usage
 * and every other line show nothing; a line that does not parse is no message, never a throw.
 */
import type { ChatMessage } from '../shared/DashboardContract.ts';
import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';

/** A tool call's input can be a whole file being written; the chat shows its start. */
export const MAXIMUM_TOOL_CALL_TEXT_CHARACTERS = 2_000;

function toolCallTextOf(block: Record<string, unknown>): string {
  const toolName = typeof block['name'] === 'string' ? block['name'] : 'tool';
  const inputText = block['input'] === undefined ? '' : ` ${JSON.stringify(block['input'])}`;
  const text = `${toolName}${inputText}`;
  return text.length > MAXIMUM_TOOL_CALL_TEXT_CHARACTERS ? `${text.slice(0, MAXIMUM_TOOL_CALL_TEXT_CHARACTERS)}…` : text;
}

function chatMessageOfContentBlock(block: unknown, at: string): ChatMessage | null {
  if (!UnknownValueUtil.isJsonObject(block)) return null;
  if (block['type'] === 'text' && typeof block['text'] === 'string' && block['text'].trim().length > 0) return { at, role: 'assistant', text: block['text'] };
  if (block['type'] === 'tool_use') return { at, role: 'tool', text: toolCallTextOf(block) };
  return null;
}

export function chatMessagesOfSessionLine(lineText: string, at: string): ChatMessage[] {
  let line: unknown;
  try {
    line = JSON.parse(lineText);
  } catch {
    return [];
  }
  if (!UnknownValueUtil.isJsonObject(line) || line['type'] !== 'assistant' || !UnknownValueUtil.isJsonObject(line['message'])) return [];
  const { content } = line['message'];
  if (!Array.isArray(content)) return [];
  return content.map((block) => chatMessageOfContentBlock(block, at)).filter((message) => message !== null);
}
