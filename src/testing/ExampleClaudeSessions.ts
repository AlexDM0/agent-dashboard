/**
 * Claude Code session records, workflow transcript folders and a Unix-socket listener standing in for a session's
 * inbox, all under a scratch home, for the orchestrator lookup and route specs. Test-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { requireScratchDirectory } from './ScratchDirectory.ts';

export interface ExampleSession {
  pid:                 number;
  sessionId:           string;
  cwd:                 string;
  messagingSocketPath: string;
}

export interface ExampleSessionListener {
  socketPath:      string;
  receivedText:    () => string;
  connectionCount: () => number;
  stop:            () => void;
}

const EXAMPLE_SESSION_VERSION = '2.1.306';

/** Named by session id rather than pid, so two records may name one live pid. */
export function writeExampleSessionRecord(homeDirectory: string, session: ExampleSession): void {
  requireScratchDirectory(homeDirectory);
  const sessionsDirectory = join(homeDirectory, '.claude', 'sessions');
  mkdirSync(sessionsDirectory, { recursive: true });
  const record = {
    ...session, status: 'idle', entrypoint: 'cli', startedAt: '2026-10-22T10:00:00.000Z', version: EXAMPLE_SESSION_VERSION
  };
  writeFileSync(join(sessionsDirectory, `${session.sessionId}.json`), JSON.stringify(record));
}

export function createExampleWorkflowRun(homeDirectory: string, session: ExampleSession, runId: string): void {
  requireScratchDirectory(homeDirectory);
  const slug = session.cwd.replace(/[^a-zA-Z0-9]/g, '-');
  mkdirSync(join(homeDirectory, '.claude', 'projects', slug, session.sessionId, 'subagents', 'workflows', runId), { recursive: true });
}

/** Keep `directory` short: macOS refuses a socket path over 104 bytes. */
export function listenAsExampleSession(directory: string, name: string): ExampleSessionListener {
  requireScratchDirectory(directory);
  const socketPath = join(directory, `${name}.sock`);
  let received = '';
  let connections = 0;
  const listener = Bun.listen({
    unix:   socketPath,
    socket: {
      open() {
        connections++;
      },
      data(_socket, chunk) {
        received += chunk.toString('utf8');
      },
    },
  });
  return {
    socketPath,
    receivedText:    () => received,
    connectionCount: () => connections,
    stop:            () => listener.stop(true),
  };
}

/** A pid that named a process which has exited and been reaped. */
export async function exitedProcessId(): Promise<number> {
  const exitedProcess = Bun.spawn([process.execPath, '--eval', '0']);
  await exitedProcess.exited;
  return exitedProcess.pid;
}
