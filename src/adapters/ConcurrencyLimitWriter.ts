/**
 * Sets a project's concurrency limit by running `agent-progress concurrency <limit>` in its root, so the CLI writes its
 * own tracker under its own lock; exit 1 is the CLI's refusal with its message, anything else not 0 is `failed`.
 */
import { type AgentProgressWriteVerdict, runAgentProgressWrite } from './AgentProgressWrite.ts';

export interface ConcurrencyLimitWriteRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  limit:               number;
  timeoutMilliseconds: number;
}

export type ConcurrencyLimitWriteVerdict = AgentProgressWriteVerdict;

export function writeConcurrencyLimit(request: ConcurrencyLimitWriteRequest): Promise<ConcurrencyLimitWriteVerdict> {
  return runAgentProgressWrite({ ...request, commandArguments: ['concurrency', String(request.limit)] }, 'agent-progress concurrency refused the limit');
}
