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
export async function runAgentDashboard(
  commandLineArguments: readonly string[],
  homeDirectory:        string,
  environment:          Record<string, string> = scratchDashboardEnvironment(homeDirectory),
): Promise<DashboardProcessResult> {
  requireScratchDirectory(homeDirectory);
  if (environment['HOME'] !== homeDirectory) throw new Error('A dashboard process runs only with HOME set to its scratch home.');
  const spawned = Bun.spawn([process.execPath, dashboardEntryPoint(), ...commandLineArguments], {
    cwd:    homeDirectory,
    stdin:  'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env:    environment,
  });
  const [standardOutput, standardError, exitCode] = await Promise.all([
    new Response(spawned.stdout).text(),
    new Response(spawned.stderr).text(),
    spawned.exited,
  ]);
  return { exitCode, standardOutput, standardError };
}

const FREE_PORT_SEARCH_ATTEMPTS = 20;
const PORT_TAKEN_RETRY_ATTEMPTS = 5;

function portCanBeBound(port: number): boolean {
  try {
    Bun.listen({ hostname: '127.0.0.1', port, socket: { data: () => {} } }).stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * A port the kernel just handed out and released, with the board port one above it bindable too, so the end-to-end server
 * never meets the owner's own dashboard on 4710. Released ports can still be taken before the child binds them.
 */
export function freeDashboardPort(): number {
  for (let i = 0; i < FREE_PORT_SEARCH_ATTEMPTS; i += 1) {
    const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
    const { port } = listener;
    const boardPortIsFree = portCanBeBound(port + 1);
    listener.stop(true);
    if (boardPortIsFree) return port;
  }
  throw new Error(`No free port with a free board port above it in ${FREE_PORT_SEARCH_ATTEMPTS} tries.`);
}

/** Runs an attempt on a fresh free dashboard port again while another process took that port first, then returns its last outcome. */
export async function onFreeDashboardPort<Outcome>(
  attempt:      (port: number) => Promise<Outcome>,
  portWasTaken: (outcome: Outcome) => boolean,
): Promise<Outcome> {
  let outcome = await attempt(freeDashboardPort());
  for (let i = 1; i < PORT_TAKEN_RETRY_ATTEMPTS && portWasTaken(outcome); i += 1) outcome = await attempt(freeDashboardPort());
  return outcome;
}

/** A refusal at exit 1 for a held port, or a detached server that stopped while binding one. */
export function refusedForAHeldPort(result: DashboardProcessResult): boolean {
  return result.exitCode === 1 && /already held|is held by|stopped while starting/u.test(result.standardError);
}
