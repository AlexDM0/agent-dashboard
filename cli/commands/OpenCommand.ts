import { readDependencyResolution }              from '../../src/adapters/DependencyResolutionReader.ts';
import type { CommandContext }                   from '../CommandContext.ts';
import { openInTheDefaultBrowser }               from '../OpenInTheDefaultBrowser.ts';
import type { CommandOptions }                   from '../ParsedCommandLine.ts';
import { localServerUrlOf, probeServerIdentity } from '../ServerIdentityProbe.ts';
import { startAnsweringDetachedServer }          from './AnsweringDetachedServer.ts';
import { printDependencyWarning }                from './MissingDependenciesWarning.ts';
import { portHeldRefusalFor }                    from './PortHeldRefusal.ts';
import { runningDashboardServerOf }              from './RunningDashboardServer.ts';
import { runningElsewhereRefusalFor }            from './RunningElsewhereRefusal.ts';

async function urlOfAServerStartedOrReused(options: CommandOptions, context: CommandContext): Promise<{ url: string; started: boolean }> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind === 'running') {
    if (options.portIsGiven && localServerUrlOf(options.port) !== running.url) throw runningElsewhereRefusalFor(running.url, options.port);
    return { url: running.url, started: false };
  }
  const url = localServerUrlOf(options.port);
  const probe = await probeServerIdentity(url);
  if (probe.kind === 'dashboard') return { url, started: false };
  if (probe.kind === 'something-else') throw portHeldRefusalFor(options.port);
  await startAnsweringDetachedServer(context, options.port);
  return { url, started: true };
}

export async function openCommand(options: CommandOptions, context: CommandContext): Promise<void> {
  const { url, started } = await urlOfAServerStartedOrReused(options, context);
  context.standardOutput(started ? `Started the dashboard server at ${url}` : `The dashboard server runs at ${url}`);
  printDependencyWarning(context, readDependencyResolution(context.dashboardDirectory));
  if (options.browserOpens && !context.browserOpeningIsDisabled) openInTheDefaultBrowser(context, url);
}
