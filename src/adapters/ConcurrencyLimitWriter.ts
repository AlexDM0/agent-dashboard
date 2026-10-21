/**
 * Sets a project's concurrency limit by running `agent-progress concurrency <limit>` in its root, so the CLI writes its
 * own tracker under its own lock; exit 1 is the CLI's refusal with its message, anything else not 0 is `failed`.
 */
import { runAgentProgress } from './AgentProgressRun.ts';

export interface ConcurrencyLimitWriteRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  limit:               number;
  timeoutMilliseconds: number;
}

export type ConcurrencyLimitWriteVerdict = { kind: 'written' } | { kind: 'refused'; reason: string } | { kind: 'failed'; reason: string };

const REFUSAL_EXIT_CODE = 1;

function firstMeaningfulLineOf(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

export async function writeConcurrencyLimit(request: ConcurrencyLimitWriteRequest): Promise<ConcurrencyLimitWriteVerdict> {
  const outcome = await runAgentProgress({ ...request, commandArguments: ['concurrency', String(request.limit)] });
  if (outcome.kind === 'failed') return outcome;
  if (outcome.exitCode === 0) return { kind: 'written' };
  const detail = firstMeaningfulLineOf(outcome.standardError);
  if (outcome.exitCode === REFUSAL_EXIT_CODE) return { kind: 'refused', reason: detail.length > 0 ? detail : 'agent-progress concurrency refused the limit' };
  return { kind: 'failed', reason: `agent-progress concurrency exited with code ${outcome.exitCode}${detail.length > 0 ? `: ${detail}` : ''}` };
}
