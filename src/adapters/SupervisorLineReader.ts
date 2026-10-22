/**
 * The NDJSON lines between an orchestrator supervisor and its clients, read into verdicts: what a client asks the
 * supervisor (chat, answer, stop), and the state and conversation the supervisor reports. A line of any other shape
 * reads as null.
 */
import type {
  ChatMessage,
  ChatRole,
  ContextUsage,
  OrchestratorState,
  PendingQuestion
} from '../shared/DashboardContract.ts';
import { UnknownValueUtil }                              from '../shared/UnknownValueUtil.ts';
import { type OrchestratorRecord, orchestratorRecordOf } from './OrchestratorRecordReader.ts';

export type SupervisorRequest =
  | { kind: 'chat'; text: string }
  | { kind: 'answer'; requestId: string; answers: Record<string, string> }
  | { kind: 'stop' };

export interface SupervisorState {
  kind:             'state';
  record:           OrchestratorRecord;
  state:            OrchestratorState;
  context:          ContextUsage | null;
  pendingQuestions: PendingQuestion[];
}

/** A chat message numbered by the supervisor from 1, so a client reconnecting takes only those it has not seen. */
export interface ConversationEntry { sequence: number; message: ChatMessage }

/** `history` is the supervisor's held conversation, sent on connect before the state; `message` one new entry. */
export type SupervisorConversation =
  | { kind: 'history'; entries: ConversationEntry[] }
  | { kind: 'message'; entry: ConversationEntry };

const ORCHESTRATOR_STATES: readonly OrchestratorState[] = ['starting', 'busy', 'idle', 'waiting-for-answer', 'ended'];

const CHAT_ROLES: readonly ChatRole[] = ['user', 'assistant', 'tool', 'system'];

function parsedObjectOf(lineText: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(lineText);
    return UnknownValueUtil.isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function answersOf(value: unknown): Record<string, string> | null {
  if (!UnknownValueUtil.isJsonObject(value)) return null;
  const entries = Object.entries(value);
  return entries.every((entry): entry is [string, string] => typeof entry[1] === 'string') ? Object.fromEntries(entries) : null;
}

export function supervisorRequestOf(lineText: string): SupervisorRequest | null {
  const line = parsedObjectOf(lineText);
  if (line === null) return null;
  if (line['kind'] === 'stop') return { kind: 'stop' };
  if (line['kind'] === 'chat') return typeof line['text'] === 'string' ? { kind: 'chat', text: line['text'] } : null;
  if (line['kind'] !== 'answer' || typeof line['requestId'] !== 'string') return null;
  const answers = answersOf(line['answers']);
  return answers === null ? null : { kind: 'answer', requestId: line['requestId'], answers };
}

/** Context and questions are the supervisor's own output, so only their outer shape is checked. */
export function supervisorStateOf(lineText: string): SupervisorState | null {
  const line = parsedObjectOf(lineText);
  if (line?.['kind'] !== 'state') return null;
  const record = orchestratorRecordOf(line['record']);
  const { state, context, pendingQuestions } = line;
  if (record === null || !ORCHESTRATOR_STATES.includes(state as OrchestratorState)) return null;
  return {
    kind:             'state',
    record,
    state:            state as OrchestratorState,
    context:          UnknownValueUtil.isJsonObject(context) ? context as unknown as ContextUsage : null,
    pendingQuestions: Array.isArray(pendingQuestions) ? pendingQuestions as PendingQuestion[] : [],
  };
}

function conversationEntryOf(value: unknown): ConversationEntry | null {
  if (!UnknownValueUtil.isJsonObject(value) || typeof value['sequence'] !== 'number' || !UnknownValueUtil.isJsonObject(value['message'])) return null;
  const { at, role, text } = value['message'];
  if (typeof at !== 'string' || typeof text !== 'string' || !CHAT_ROLES.includes(role as ChatRole)) return null;
  return { sequence: value['sequence'], message: { at, role: role as ChatRole, text } };
}

export function supervisorConversationOf(lineText: string): SupervisorConversation | null {
  const line = parsedObjectOf(lineText);
  if (line?.['kind'] === 'message') {
    const entry = conversationEntryOf(line['entry']);
    return entry === null ? null : { kind: 'message', entry };
  }
  if (line?.['kind'] !== 'history' || !Array.isArray(line['entries'])) return null;
  const entries = line['entries'].map(conversationEntryOf);
  return entries.every((entry) => entry !== null) ? { kind: 'history', entries } : null;
}
