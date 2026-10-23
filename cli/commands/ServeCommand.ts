import { startDashboardServer }                                     from '../../src/services/DashboardServer.ts';
import type { CommandContext }                                      from '../CommandContext.ts';
import type { CommandOptions }                                      from '../ParsedCommandLine.ts';
import { removeServerRecordOf, serverLogPathOf, writeServerRecord } from '../ServerRecordFile.ts';
import { detachedServerAnswerOf, unansweredServerTextOf }           from './DetachedServerAnswer.ts';
import { portHeldRefusalFor }                                       from './PortHeldRefusal.ts';
import { runningDashboardServerOf }                                 from './RunningDashboardServer.ts';
import { runningElsewhereRefusalFor }                               from './RunningElsewhereRefusal.ts';
import { startDetachedServer }                                      from './StartDetachedServer.ts';

/**
 * Runs until the server stops, by `stop`, a restart or SIGINT or SIGTERM, then removes the record if it still names this
 * process; after a restart it starts a detached successor on the same port, as `open` starts one, and says when it does not answer.
 */
export async function serveCommand(options: CommandOptions, context: CommandContext): Promise<void> {
  // The record names one server; a second one would take it over and leave the first beyond `status` and `stop`.
  const running = await runningDashboardServerOf(context.homeDirectory);
  if (running.kind === 'running' && running.identity.pid !== context.processId) throw runningElsewhereRefusalFor(running.url, options.port);
  const start = await startDashboardServer({
    port:                      options.port,
    homeDirectory:             context.homeDirectory,
    agentProgressExecutable:   context.agentProgressExecutable,
    claudeExecutable:          context.claudeExecutable,
    dashboardEntryPointPath:   context.dashboardEntryPointPath,
    runtimeExecutablePath:     context.runtimeExecutablePath,
    version:                   context.version,
    clock:                     context.now,
    machineParallelAgentLimit: context.machineParallelAgentLimit,
  });
  if (start.kind === 'port-in-use') throw portHeldRefusalFor(start.port, start.role);
  const { server } = start;
  const stopListening = context.onInterruption(() => { void server.stop(); });
  try {
    writeServerRecord(context.homeDirectory, {
      pid:         context.processId,
      port:        server.port,
      url:         server.url,
      boardOrigin: server.boardOrigin,
      startedAt:   context.now().toISOString(),
      version:     context.version,
    });
    if (context.agentProgressExecutable === null) {
      context.standardError('agent-progress is not on PATH, so every project reads as unreadable; set AGENT_DASHBOARD_AGENT_PROGRESS to its path.');
    }
    context.standardOutput(
      `The dashboard server runs at ${server.url}, its board pages at ${server.boardOrigin} (pid ${context.processId}); stop it with Ctrl-C or agent-dashboard stop.`,
    );
    await server.stopped;
  } finally {
    stopListening();
    removeServerRecordOf(context.homeDirectory, context.processId);
  }
  // Both listeners are closed and the record is gone by now, so the successor finds the ports free and no server running.
  if (server.isRestartRequested()) {
    const successor = startDetachedServer(context, server.port);
    context.standardOutput(`Restarting the dashboard server at ${server.url}.`);
    // This process writes to the server log, so the line saying why the page stays on reconnecting lands where the person looks.
    const answer = await detachedServerAnswerOf(server.url, successor);
    if (answer.kind !== 'answered') context.standardError(unansweredServerTextOf(answer, serverLogPathOf(context.homeDirectory)));
  }
}
