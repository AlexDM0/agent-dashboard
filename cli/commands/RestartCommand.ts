/**
 * `restart`, alias `reboot`: asks the running server for the same handover the page's Restart server asks for, and waits
 * until its successor answers on the same port with its own record; with no server running it starts one, as `open` does.
 */
import { readFileSync, statSync } from 'node:fs';

import { readDependencyResolution }                             from '../../src/adapters/DependencyResolutionReader.ts';
import { processIsAlive }                                       from '../../src/lib/process-liveness/ProcessIsAlive.ts';
import { DASHBOARD_PROTOCOL }                                   from '../../src/shared/constants/DashboardProtocol.ts';
import type { CommandContext }                                  from '../CommandContext.ts';
import { CommandRefusal }                                       from '../CommandRefusal.ts';
import type { CommandOptions }                                  from '../ParsedCommandLine.ts';
import { localServerUrlOf, probeServerIdentity }                from '../ServerIdentityProbe.ts';
import { type ServerRecord, readServerRecord, serverLogPathOf } from '../ServerRecordFile.ts';
import { waitMilliseconds }                                     from '../WaitMilliseconds.ts';
import { COMMAND_LINE_LIMITS }                                  from '../constants/CommandLineLimits.ts';
import { startAnsweringDetachedServer }                         from './AnsweringDetachedServer.ts';
import { printDependencyWarning }                               from './MissingDependenciesWarning.ts';
import { portHeldRefusalFor }                                   from './PortHeldRefusal.ts';
import { runningDashboardServerOf }                             from './RunningDashboardServer.ts';
import { unansweringServerRefusalFor }                          from './UnansweringServerRefusal.ts';

interface RestartTarget {
  url:       string;
  processId: number;
}

type SuccessorVerdict =
  | { kind: 'answered'; record: ServerRecord }
  | { kind: 'gone' }
  | { kind: 'timed-out' };

/** Null when no dashboard server runs, for the record or on the port. */
async function restartTargetOf(options: CommandOptions, context: CommandContext): Promise<RestartTarget | null> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind === 'running') {
    if (options.portIsGiven && localServerUrlOf(options.port) !== running.url) {
      throw new CommandRefusal(`The dashboard server runs at ${running.url}, not on port ${options.port}; restart it without --port, or stop it first.`);
    }
    return { url: running.url, processId: running.identity.pid };
  }
  if (running.kind === 'not-answering' && processIsAlive(running.record.pid)) throw unansweringServerRefusalFor(running.record, context.homeDirectory);
  const url = localServerUrlOf(options.port);
  const probe = await probeServerIdentity(url);
  if (probe.kind === 'something-else') throw portHeldRefusalFor(options.port);
  return probe.kind === 'dashboard' ? { url, processId: probe.identity.pid } : null;
}

async function requestRestart(url: string): Promise<void> {
  const response = await fetch(`${url}${DASHBOARD_PROTOCOL.RESTART_PATH}`, {
    method:  'POST',
    headers: { [DASHBOARD_PROTOCOL.RESTART_HEADER_NAME]: DASHBOARD_PROTOCOL.RESTART_HEADER_VALUE },
    signal:  AbortSignal.timeout(COMMAND_LINE_LIMITS.SHUTDOWN_REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (response.status !== DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS) {
    throw new Error(`The dashboard server at ${url} answered the restart request with ${response.status}.`);
  }
}

/** The old server lives until its successor answers or fails to, so its end with nothing answering is a failed handover. */
async function successorOf(target: RestartTarget, homeDirectory: string): Promise<SuccessorVerdict> {
  const attempts = Math.ceil(COMMAND_LINE_LIMITS.SERVER_RESTART_TIMEOUT_MILLISECONDS / COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const probe = await probeServerIdentity(target.url);
    if (probe.kind === 'dashboard' && probe.identity.pid !== target.processId) {
      const reading = readServerRecord(homeDirectory);
      if (reading.kind === 'present' && reading.record.pid === probe.identity.pid) return { kind: 'answered', record: reading.record };
    } else if (probe.kind !== 'dashboard' && !processIsAlive(target.processId)) {
      return { kind: 'gone' };
    }
    await waitMilliseconds(COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  }
  return { kind: 'timed-out' };
}

function serverLogLengthOf(homeDirectory: string): number {
  try {
    return statSync(serverLogPathOf(homeDirectory)).size;
  } catch {
    return 0;
  }
}

/** What the old server and its successor wrote to the log since `logLength`: the old one says there why its successor did not answer. */
function serverLogTextSince(homeDirectory: string, logLength: number): string {
  try {
    return readFileSync(serverLogPathOf(homeDirectory)).subarray(logLength).toString('utf8').trim();
  } catch {
    return '';
  }
}

function failedRestartTextOf(target: RestartTarget, successor: Exclude<SuccessorVerdict, { kind: 'answered' }>, logText: string, logPath: string): string {
  const timeout = successor.kind === 'timed-out' ? ` within ${COMMAND_LINE_LIMITS.SERVER_RESTART_TIMEOUT_MILLISECONDS} ms` : '';
  const reason = logText === '' ? `Its log is ${logPath}.` : `Its log ${logPath} says:\n${logText}`;
  return `The dashboard server at ${target.url} (pid ${target.processId}) was asked to restart, but no successor answered${timeout}. ${reason}`;
}

export async function restartCommand(options: CommandOptions, context: CommandContext): Promise<void> {
  const target = await restartTargetOf(options, context);
  if (target === null) {
    const url = localServerUrlOf(options.port);
    await startAnsweringDetachedServer(context, options.port);
    const started = await probeServerIdentity(url);
    const processIdText = started.kind === 'dashboard' ? ` (pid ${started.identity.pid})` : '';
    context.standardOutput(`No dashboard server was running; started one at ${url}${processIdText}.`);
  } else {
    const logLength = serverLogLengthOf(context.homeDirectory);
    await requestRestart(target.url);
    const successor = await successorOf(target, context.homeDirectory);
    if (successor.kind !== 'answered') {
      throw new Error(failedRestartTextOf(target, successor, serverLogTextSince(context.homeDirectory, logLength), serverLogPathOf(context.homeDirectory)));
    }
    context.standardOutput(`Restarted the dashboard server at ${target.url}; its pid is now ${successor.record.pid} (was ${target.processId}).`);
  }
  printDependencyWarning(context, readDependencyResolution(context.dashboardDirectory));
}
