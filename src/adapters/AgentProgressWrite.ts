/**
 * Runs an agent-progress command that writes the project's own tracker under its own lock, and translates how it ended:
 * exit 0 is `written`, exit 1 the CLI's refusal with its first line, anything else `failed`.
 */
import { type AgentProgressRunRequest, runAgentProgress } from './AgentProgressRun.ts';

export type AgentProgressWriteVerdict = { kind: 'written' } | { kind: 'refused'; reason: string } | { kind: 'failed'; reason: string };

const REFUSAL_EXIT_CODE = 1;

function firstMeaningfulLineOf(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/** `silentRefusalReason` stands in for a refusal that printed nothing. */
export async function runAgentProgressWrite(request: AgentProgressRunRequest, silentRefusalReason: string): Promise<AgentProgressWriteVerdict> {
  const outcome = await runAgentProgress(request);
  if (outcome.kind === 'failed') return outcome;
  if (outcome.exitCode === 0) return { kind: 'written' };
  const detail = firstMeaningfulLineOf(outcome.standardError);
  if (outcome.exitCode === REFUSAL_EXIT_CODE) return { kind: 'refused', reason: detail.length > 0 ? detail : silentRefusalReason };
  const commandName = `agent-progress ${request.commandArguments[0] ?? ''}`.trim();
  return { kind: 'failed', reason: `${commandName} exited with code ${outcome.exitCode}${detail.length > 0 ? `: ${detail}` : ''}` };
}
