import type { CommandContext }      from '../CommandContext.ts';
import type { CommandOptions }      from '../ParsedCommandLine.ts';
import { runningDashboardServerOf } from './RunningDashboardServer.ts';

export async function statusCommand(_options: CommandOptions, context: CommandContext): Promise<void> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  context.standardOutput(running.kind === 'running'
    ? `The dashboard server runs at ${running.url} (pid ${running.identity.pid}, version ${running.identity.version}).`
    : 'No dashboard server is running.');
}
