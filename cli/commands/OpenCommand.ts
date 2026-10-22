import { spawn }                          from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';

import { boardPortOf }                           from '../../src/services/DashboardServer.ts';
import { DASHBOARD_LIMITS }                      from '../../src/shared/constants/DashboardLimits.ts';
import type { CommandContext }                   from '../CommandContext.ts';
import { CommandRefusal }                        from '../CommandRefusal.ts';
import { openInTheDefaultBrowser }               from '../OpenInTheDefaultBrowser.ts';
import type { CommandOptions }                   from '../ParsedCommandLine.ts';
import { portIsFree }                            from '../PortIsFree.ts';
import { localServerUrlOf, probeServerIdentity } from '../ServerIdentityProbe.ts';
import { dashboardDirectoryOf, serverLogPathOf } from '../ServerRecordFile.ts';
import { waitMilliseconds }                      from '../WaitMilliseconds.ts';
import { COMMAND_LINE_LIMITS }                   from '../constants/CommandLineLimits.ts';
import { portHeldRefusalFor }                    from './PortHeldRefusal.ts';
import { runningDashboardServerOf }              from './RunningDashboardServer.ts';
import { runningElsewhereRefusalFor }            from './RunningElsewhereRefusal.ts';

interface DetachedServer {
  exitCode: () => number | null;
}

/** Output is appended to the log, so a server that failed to start leaves its reason there. */
function startDetachedServer(context: CommandContext, port: number): DetachedServer {
  mkdirSync(dashboardDirectoryOf(context.homeDirectory), { recursive: true });
  const logDescriptor = openSync(serverLogPathOf(context.homeDirectory), 'a');
  let exitCode: number | null = null;
  try {
    const child = spawn(
      context.runtimeExecutablePath,
      [context.dashboardEntryPointPath, 'serve', '--port', String(port)],
      // A fixed folder of the dashboard's own, so the server never loads the `.env` or `bunfig.toml` of wherever `open` was typed.
      { detached: true, stdio: ['ignore', logDescriptor, logDescriptor], cwd: dashboardDirectoryOf(context.homeDirectory) },
    );
    child.on('exit', (code) => { exitCode = code ?? 1; });
    child.on('error', () => { exitCode = 1; });
    child.unref();
  } finally {
    closeSync(logDescriptor);
  }
  return { exitCode: () => exitCode };
}

async function waitUntilTheServerAnswers(context: CommandContext, url: string, server: DetachedServer): Promise<void> {
  const attempts = Math.ceil(DASHBOARD_LIMITS.SERVER_START_TIMEOUT_MILLISECONDS / COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  const logPath = serverLogPathOf(context.homeDirectory);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const probe = await probeServerIdentity(url);
    if (probe.kind === 'dashboard') return;
    const exitCode = server.exitCode();
    if (exitCode !== null) {
      throw new CommandRefusal(`The dashboard server stopped while starting (exit ${exitCode}); its log is ${logPath}.`);
    }
    await waitMilliseconds(COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  }
  // A timeout is a refusal: the person can read the log and try again, nothing here is broken beyond repair.
  throw new CommandRefusal(
    `The dashboard server did not answer within ${DASHBOARD_LIMITS.SERVER_START_TIMEOUT_MILLISECONDS} ms; its log is ${logPath}.`,
  );
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
  if (options.browserOpens && !context.browserOpeningIsDisabled) openInTheDefaultBrowser(context, url);
}
