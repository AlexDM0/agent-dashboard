import type { CommandContext }      from '../CommandContext.ts';
import type { CommandOptions }      from '../ParsedCommandLine.ts';
import { runningDashboardServerOf } from './RunningDashboardServer.ts';

export async function statusCommand(_options: CommandOptions, context: CommandContext): Promise<void> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind !== 'running') {
    context.standardOutput('No dashboard server is running.');
    return;
  }
  const boardPages = running.boardOrigin === null ? '' : `, its board pages at ${running.boardOrigin}`;
  context.standardOutput(`The dashboard server runs at ${running.url}${boardPages} (pid ${running.identity.pid}, version ${running.identity.version}).`);
}
