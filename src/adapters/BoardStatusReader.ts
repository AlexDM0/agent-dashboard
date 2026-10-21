/**
 * Runs `agent-progress status --json --full` in a project's root and maps what it prints to a verdict; a missing
 * executable, a non-zero exit, a timeout or output that is not the expected JSON is `unreadable`, never a throw.
 */
import { runAgentProgress }                         from './AgentProgressRun.ts';
import { type BoardSummaryVerdict, boardSummaryOf } from './BoardSummaryMapper.ts';

export interface BoardStatusReadRequest {
  executable:          string | null;
  /** The Bun running the dashboard, which runs an agent-progress that is a Bun script itself. */
  runtimeExecutable:   string;
  root:                string;
  timeoutMilliseconds: number;
}

const STATUS_ARGUMENTS = ['status', '--json', '--full'] as const;

const REASON_STANDARD_ERROR_LINE_COUNT = 3;

function firstMeaningfulLines(text: string): string {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).slice(0, REASON_STANDARD_ERROR_LINE_COUNT).join(' ');
}

export async function readBoardStatus(request: BoardStatusReadRequest): Promise<BoardSummaryVerdict> {
  const outcome = await runAgentProgress({ ...request, commandArguments: STATUS_ARGUMENTS });
  if (outcome.kind === 'failed') return { kind: 'unreadable', reason: outcome.reason };
  if (outcome.exitCode !== 0) {
    const detail = firstMeaningfulLines(outcome.standardError);
    return { kind: 'unreadable', reason: `agent-progress status exited with code ${outcome.exitCode}${detail.length > 0 ? `: ${detail}` : ''}` };
  }

  let document: unknown;
  try {
    document = JSON.parse(outcome.standardOutput);
  } catch {
    return { kind: 'unreadable', reason: 'agent-progress status printed output that is not JSON' };
  }
  return boardSummaryOf(document);
}
