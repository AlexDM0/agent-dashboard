/**
 * Which dashboard server, if any, the server record names and answers as the dashboard. A record whose server does not
 * answer, or answers as something else, is kept with its contents, so a caller can ask whether its process still lives.
 */
import { type ServerIdentity }                 from '../../src/shared/DashboardContract.ts';
import { probeServerIdentity }                 from '../ServerIdentityProbe.ts';
import { type ServerRecord, readServerRecord } from '../ServerRecordFile.ts';

export type RunningServerVerdict =
  | { kind: 'running'; url: string; boardOrigin: string | null; identity: ServerIdentity }
  | { kind: 'no-record' }
  | { kind: 'unreadable-record' }
  | { kind: 'not-answering'; record: ServerRecord };

export async function runningDashboardServerOf(homeDirectory: string): Promise<RunningServerVerdict> {
  const reading = readServerRecord(homeDirectory);
  if (reading.kind === 'missing') return { kind: 'no-record' };
  if (reading.kind === 'unreadable') return { kind: 'unreadable-record' };
  const probe = await probeServerIdentity(reading.record.url);
  return probe.kind === 'dashboard'
    ? {
      kind: 'running', url: reading.record.url, boardOrigin: reading.record.boardOrigin, identity: probe.identity
    }
    : { kind: 'not-answering', record: reading.record };
}
