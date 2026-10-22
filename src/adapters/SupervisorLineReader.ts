/**
 * The NDJSON lines between an orchestrator supervisor and its clients, read into verdicts: what a client asks the
 * supervisor (chat, answer, stop) and the state the supervisor reports. A line of any other shape reads as null.
 */
import type { ContextUsage, OrchestratorState, PendingQuestion } from '../shared/DashboardContract.ts';
import { UnknownValueUtil }                                      from '../shared/UnknownValueUtil.ts';
import { type OrchestratorRecord, orchestratorRecordOf }         from './OrchestratorRecordReader.ts';

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

const ORCHESTRATOR_STATES: readonly OrchestratorState[] = ['starting', 'busy', 'idle', 'waiting-for-answer', 'ended'];

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
