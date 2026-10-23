import { processIsAlive }                           from '../../src/lib/process-liveness/ProcessIsAlive.ts';
import { DASHBOARD_PROTOCOL }                       from '../../src/shared/constants/DashboardProtocol.ts';
import type { CommandContext }                      from '../CommandContext.ts';
import { CommandRefusal }                           from '../CommandRefusal.ts';
import type { CommandOptions }                      from '../ParsedCommandLine.ts';
import { probeServerIdentity }                      from '../ServerIdentityProbe.ts';
import { removeServerRecord, removeServerRecordOf } from '../ServerRecordFile.ts';
import { waitMilliseconds }                         from '../WaitMilliseconds.ts';
import { COMMAND_LINE_LIMITS }                      from '../constants/CommandLineLimits.ts';
import { runningDashboardServerOf }                 from './RunningDashboardServer.ts';
import { unansweringServerRefusalFor }              from './UnansweringServerRefusal.ts';

async function requestShutdown(url: string): Promise<void> {
  const response = await fetch(`${url}${DASHBOARD_PROTOCOL.SHUTDOWN_PATH}`, {
    method:  'POST',
    headers: { [DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_NAME]: DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_VALUE },
    signal:  AbortSignal.timeout(COMMAND_LINE_LIMITS.SHUTDOWN_REQUEST_TIMEOUT_MILLISECONDS),
  });
  if (response.status !== DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS) {
    throw new Error(`The dashboard server at ${url} answered the shutdown request with ${response.status}.`);
  }
}

/** Waits for the process to end as well as the port to close, so the record its `serve` removes on the way out is gone too. */
async function waitUntilTheServerIsGone(url: string, processId: number): Promise<void> {
  const attempts = Math.ceil(COMMAND_LINE_LIMITS.SERVER_STOP_TIMEOUT_MILLISECONDS / COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!processIsAlive(processId) && (await probeServerIdentity(url)).kind === 'no-answer') return;
    await waitMilliseconds(COMMAND_LINE_LIMITS.SERVER_POLL_INTERVAL_MILLISECONDS);
  }
  // A timeout is a refusal: the server was asked and may still be finishing; asking again is the person's call.
  throw new CommandRefusal(`The dashboard server (pid ${processId}) was asked to stop but still runs after ${COMMAND_LINE_LIMITS.SERVER_STOP_TIMEOUT_MILLISECONDS} ms.`);
}

/** A record is stale, and removed, only when it cannot be read or its process is gone; a living one may just be slow to answer. */
export async function stopCommand(_options: CommandOptions, context: CommandContext): Promise<void> {
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind === 'no-record') {
    context.standardOutput('No dashboard server is running.');
    return;
  }
  if (running.kind === 'not-answering' && processIsAlive(running.record.pid)) {
    throw unansweringServerRefusalFor(running.record, context.homeDirectory);
  }
  if (running.kind !== 'running') {
    removeServerRecord(context.homeDirectory);
    context.standardOutput('No dashboard server is running; removed its stale server record.');
    return;
  }
  await requestShutdown(running.url);
  await waitUntilTheServerIsGone(running.url, running.identity.pid);
  removeServerRecordOf(context.homeDirectory, running.identity.pid);
  context.standardOutput(`Stopped the dashboard server at ${running.url} (pid ${running.identity.pid}).`);
}
