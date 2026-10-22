/**
 * Stops a project's dispatcher by running `agent-progress dispatcher stopped` in its root: the CLI stores the state,
 * and the running dispatcher reads it as each agent returns, starting no new one while those in flight finish.
 */
import { type AgentProgressWriteVerdict, runAgentProgressWrite } from './AgentProgressWrite.ts';

export interface DispatcherStopRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  timeoutMilliseconds: number;
}

export type DispatcherStopVerdict = AgentProgressWriteVerdict;

export function writeDispatcherStopped(request: DispatcherStopRequest): Promise<DispatcherStopVerdict> {
  return runAgentProgressWrite({ ...request, commandArguments: ['dispatcher', 'stopped'] }, 'agent-progress dispatcher refused to stop');
}
