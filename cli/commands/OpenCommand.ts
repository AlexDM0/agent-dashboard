import { readDependencyResolution }                       from '../../src/adapters/DependencyResolutionReader.ts';
import { boardPortOf }                                    from '../../src/services/DashboardServer.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import { CommandRefusal }                                 from '../CommandRefusal.ts';
import { openInTheDefaultBrowser }                        from '../OpenInTheDefaultBrowser.ts';
import type { CommandOptions }                            from '../ParsedCommandLine.ts';
import { portIsFree }                                     from '../PortIsFree.ts';
import { localServerUrlOf, probeServerIdentity }          from '../ServerIdentityProbe.ts';
import { serverLogPathOf }                                from '../ServerRecordFile.ts';
import { detachedServerAnswerOf, unansweredServerTextOf } from './DetachedServerAnswer.ts';
import { printDependencyWarning }                         from './MissingDependenciesWarning.ts';
import { portHeldRefusalFor }                             from './PortHeldRefusal.ts';
import { runningDashboardServerOf }                       from './RunningDashboardServer.ts';
import { runningElsewhereRefusalFor }                     from './RunningElsewhereRefusal.ts';
import { startDetachedServer }                            from './StartDetachedServer.ts';
import type { DetachedServer }                            from './StartDetachedServer.ts';

async function waitUntilTheServerAnswers(context: CommandContext, url: string, server: DetachedServer): Promise<void> {
  const answer = await detachedServerAnswerOf(url, server);
  // A timeout is a refusal too: the person can read the log and try again, nothing here is broken beyond repair.
  if (answer.kind !== 'answered') throw new CommandRefusal(unansweredServerTextOf(answer, serverLogPathOf(context.homeDirectory)));
}

async function urlOfAServerStartedOrReused(options: CommandOptions, context: CommandContext): Promise<{ url: string; started: boolean }> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind === 'running') {
    if (options.portIsGiven && localServerUrlOf(options.port) !== running.url) throw runningElsewhereRefusalFor(running.url, options.port);
    return { url: running.url, started: false };
  }
  const url = localServerUrlOf(options.port);
  const probe = await probeServerIdentity(url);
  if (probe.kind === 'dashboard') return { url, started: false };
  if (probe.kind === 'something-else' || !portIsFree(options.port)) throw portHeldRefusalFor(options.port);
  if (!portIsFree(boardPortOf(options.port))) throw portHeldRefusalFor(boardPortOf(options.port), 'board');
  await waitUntilTheServerAnswers(context, url, startDetachedServer(context, options.port));
  return { url, started: true };
}

export async function openCommand(options: CommandOptions, context: CommandContext): Promise<void> {
  const { url, started } = await urlOfAServerStartedOrReused(options, context);
  context.standardOutput(started ? `Started the dashboard server at ${url}` : `The dashboard server runs at ${url}`);
  printDependencyWarning(context, readDependencyResolution(context.dashboardDirectory));
  if (options.browserOpens && !context.browserOpeningIsDisabled) openInTheDefaultBrowser(context, url);
}
