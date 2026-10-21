/**
 * Spawns the real binary, for the claims an in-process `runCommandLine` cannot make: that `agent-dashboard.ts` runs, starts a
 * detached server and exits. The child's environment is built, never inherited, and its `HOME` is always a scratch folder.
 */
import { existsSync }    from 'node:fs';
import { dirname, join } from 'node:path';

import { requireScratchDirectory } from '../../src/testing/ScratchDirectory.ts';

export interface DashboardProcessResult {
  exitCode:       number;
  standardOutput: string;
  standardError:  string;
}

function dashboardEntryPoint(): string {
  const entryPoint = join(import.meta.dir, '..', '..', 'agent-dashboard.ts');
  if (!existsSync(entryPoint)) throw new Error(`The CLI entry point is not at ${entryPoint}; cli/testing/DashboardProcess.ts has to be told.`);
  return entryPoint;
}

/** No browser, and an agent-progress that does not exist, so the server it starts reads every project as unreadable and opens nothing. */
export function scratchDashboardEnvironment(homeDirectory: string): Record<string, string> {
  return {
    PATH:                           ['/usr/bin', '/bin', dirname(process.execPath)].join(':'),
    HOME:                           homeDirectory,
    AGENT_DASHBOARD_NO_BROWSER:     '1',
    AGENT_DASHBOARD_AGENT_PROGRESS: join(homeDirectory, 'no-such-agent-progress'),
  };
}

/** Both streams are read to their end before the exit is awaited: a detached server inherits no pipe, so the ends arrive. */
export async function runAgentDashboard(commandLineArguments: readonly string[], homeDirectory: string): Promise<DashboardProcessResult> {
  requireScratchDirectory(homeDirectory);
  const spawned = Bun.spawn([process.execPath, dashboardEntryPoint(), ...commandLineArguments], {
    cwd:    homeDirectory,
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env:    scratchDashboardEnvironment(homeDirectory),
  });
  const [standardOutput, standardError, exitCode] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]);
  return { exitCode, standardOutput, standardError };
}

/** A port the kernel just handed out and released, so the end-to-end server never meets the owner's own dashboard on 4710. */
export function freeLocalPort(): number {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
  const { port } = listener;
  listener.stop(true);
  return port;
}
