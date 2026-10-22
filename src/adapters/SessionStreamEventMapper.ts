/**
 * One stdout line of a `claude -p --output-format stream-json` session to the event a supervisor acts on. A line it does
 * not know, or cannot parse, is `other`: the session's output is never a reason to throw.
 */
import type { Question, QuestionOption } from '../shared/DashboardContract.ts';
import { UnknownValueUtil }              from '../shared/UnknownValueUtil.ts';

export type SessionStreamEvent =
  | { kind: 'init'; claudeCodeVersion: string | null }
  | { kind: 'assistant-usage'; usedTokens: number; model: string }
  | { kind: 'result'; contextWindowTokensByModel: Record<string, number> }
  | { kind: 'question'; requestId: string; input: Record<string, unknown>; questions: Question[] }
  | { kind: 'permission-request'; requestId: string }
  | { kind: 'other' };

const QUESTION_TOOL_NAME = 'AskUserQuestion';

const USED_TOKEN_FIELDS = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'] as const;

function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function questionOptionOf(value: unknown): QuestionOption | null {
  if (!UnknownValueUtil.isJsonObject(value) || typeof value['label'] !== 'string') return null;
  return { label: value['label'], description: textOr(value['description'], '') };
}

function questionOf(value: unknown): Question | null {
  if (!UnknownValueUtil.isJsonObject(value) || typeof value['question'] !== 'string') return null;
  const options = Array.isArray(value['options']) ? value['options'].map(questionOptionOf) : [];
  if (options.some((option) => option === null)) return null;
  return {
    question:    value['question'],
    header:      textOr(value['header'], ''),
    multiSelect: value['multiSelect'] === true,
    options:     options as QuestionOption[],
  };
}

function controlRequestEventOf(line: Record<string, unknown>): SessionStreamEvent {
  const { request } = line;
  const requestId = line['request_id'];
  if (typeof requestId !== 'string' || !UnknownValueUtil.isJsonObject(request) || request['subtype'] !== 'can_use_tool') return { kind: 'other' };
  const { input } = request;
  if (request['tool_name'] !== QUESTION_TOOL_NAME || !UnknownValueUtil.isJsonObject(input) || !Array.isArray(input['questions'])) {
    return { kind: 'permission-request', requestId };
  }
  const questions = input['questions'].map(questionOf);
  if (questions.length === 0 || questions.some((question) => question === null)) return { kind: 'permission-request', requestId };
  return {
    kind: 'question', requestId, input, questions: questions as Question[]
  };
}

function assistantEventOf(line: Record<string, unknown>): SessionStreamEvent {
  const { message } = line;
  if (!UnknownValueUtil.isJsonObject(message) || !UnknownValueUtil.isJsonObject(message['usage']) || typeof message['model'] !== 'string') return { kind: 'other' };
  const { usage } = message;
  const usedTokens = USED_TOKEN_FIELDS.reduce((sum, field) => sum + (typeof usage[field] === 'number' ? usage[field] : 0), 0);
  return { kind: 'assistant-usage', usedTokens, model: message['model'] };
}

function resultEventOf(line: Record<string, unknown>): SessionStreamEvent {
  const { modelUsage } = line;
  const contextWindowTokensByModel: Record<string, number> = {};
  if (UnknownValueUtil.isJsonObject(modelUsage)) {
    for (const [model, usage] of Object.entries(modelUsage)) {
      if (UnknownValueUtil.isJsonObject(usage) && typeof usage['contextWindow'] === 'number') contextWindowTokensByModel[model] = usage['contextWindow'];
    }
  }
  return { kind: 'result', contextWindowTokensByModel };
}

export function sessionStreamEventOf(lineText: string): SessionStreamEvent {
  let line: unknown;
  try {
    line = JSON.parse(lineText);
  } catch {
    return { kind: 'other' };
  }
  if (!UnknownValueUtil.isJsonObject(line)) return { kind: 'other' };
  switch (line['type']) {
    case 'system': {
      const claudeCodeVersion = typeof line['claude_code_version'] === 'string' ? line['claude_code_version'] : null;
      return line['subtype'] === 'init' ? { kind: 'init', claudeCodeVersion } : { kind: 'other' };
    }
    case 'assistant':
      return assistantEventOf(line);
    case 'result':
      return resultEventOf(line);
    case 'control_request':
      return controlRequestEventOf(line);
    default:
      return { kind: 'other' };
  }
}
