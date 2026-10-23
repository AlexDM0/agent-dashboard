import { spawn }                          from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';

import type { CommandContext }                   from '../CommandContext.ts';
import { dashboardDirectoryOf, serverLogPathOf } from '../ServerRecordFile.ts';

export interface DetachedServer {
  exitCode: () => number | null;
}

/** Output is appended to the log, so a server that failed to start leaves its reason there. */
export function startDetachedServer(context: CommandContext, port: number): DetachedServer {
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
