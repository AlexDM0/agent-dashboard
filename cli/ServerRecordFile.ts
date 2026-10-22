/**
 * The server record `~/.agent-progress-monitor/agent-dashboard/server.json`, naming the one dashboard server a `serve` runs. A
 * record that cannot be read is a verdict, never a throw: a stale or torn record is ignored the same way.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join }                 from 'node:path';

import { writeFileAtomically } from '../src/lib/atomic-file/AtomicFile.ts';
import { DASHBOARD_FILES }     from '../src/shared/constants/DashboardFiles.ts';

export interface ServerRecord {
  pid:         number;
  port:        number;
  url:         string;
  /** Where the board pages are served; null in a record an older dashboard wrote, which still names a server to stop. */
  boardOrigin: string | null;
  startedAt:   string;
  version:     string;
}

export type ServerRecordReading =
  | { kind: 'present'; record: ServerRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export function dashboardDirectoryOf(homeDirectory: string): string {
  return join(homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME, DASHBOARD_FILES.DASHBOARD_DIRECTORY_NAME);
}

export function serverRecordPathOf(homeDirectory: string): string {
  return join(dashboardDirectoryOf(homeDirectory), DASHBOARD_FILES.SERVER_RECORD_FILE_NAME);
}

export function serverLogPathOf(homeDirectory: string): string {
  return join(dashboardDirectoryOf(homeDirectory), DASHBOARD_FILES.SERVER_LOG_FILE_NAME);
}

function recordFrom(document: unknown): ServerRecord | null {
  if (typeof document !== 'object' || document === null) return null;
  const candidate = document as Record<string, unknown>;
  const {
    pid: processId, port, url, boardOrigin, startedAt, version
  } = candidate;
  if (typeof processId !== 'number' || !Number.isInteger(processId)) return null;
  if (typeof port !== 'number' || !Number.isInteger(port)) return null;
  if (typeof url !== 'string' || typeof startedAt !== 'string' || typeof version !== 'string') return null;
  if (boardOrigin !== undefined && boardOrigin !== null && typeof boardOrigin !== 'string') return null;
  return {
    pid: processId, port, url, boardOrigin: boardOrigin ?? null, startedAt, version
  };
}

export function readServerRecord(homeDirectory: string): ServerRecordReading {
  let text: string;
  try {
    text = readFileSync(serverRecordPathOf(homeDirectory), 'utf8');
  } catch (problem) {
    if ((problem as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'unreadable', reason: problem instanceof Error ? problem.message : String(problem) };
  }
  try {
    const record = recordFrom(JSON.parse(text));
    return record === null ? { kind: 'unreadable', reason: 'the record lacks a field or holds one of the wrong type' } : { kind: 'present', record };
  } catch (problem) {
    return { kind: 'unreadable', reason: problem instanceof Error ? problem.message : String(problem) };
  }
}

/** A reader sees the whole old record or the whole new one. */
export function writeServerRecord(homeDirectory: string, record: ServerRecord): void {
  writeFileAtomically(serverRecordPathOf(homeDirectory), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Removes the record only while it names `processId`, so a server stopping late never removes its successor's record or
 * one it cannot read. Never throws: it runs on the way out, where the error being reported is the command's own.
 */
export function removeServerRecordOf(homeDirectory: string, processId: number): void {
  const reading = readServerRecord(homeDirectory);
  if (reading.kind !== 'present' || reading.record.pid !== processId) return;
  try {
    rmSync(serverRecordPathOf(homeDirectory), { force: true });
  } catch {
    // A record that cannot be removed is stale once this process is gone; `stop` and `open` read it as such.
  }
}

export function removeServerRecord(homeDirectory: string): void {
  rmSync(serverRecordPathOf(homeDirectory), { force: true });
}
