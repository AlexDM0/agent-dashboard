/**
 * The executables record `setup.sh` writes, `{ claude, agentProgress }` each an absolute path or null, to a verdict: a
 * missing or damaged record never throws. Whether a recorded path still exists is the caller's question.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }  from '../shared/constants/DashboardFiles.ts';

export interface ExecutablesRecord {
  claude:        string | null;
  agentProgress: string | null;
}

export type ExecutablesRecordReading =
  | { kind: 'present'; record: ExecutablesRecord }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

export function executablesRecordPathOf(homeDirectory: string): string {
  return join(homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME, DASHBOARD_FILES.DASHBOARD_DIRECTORY_NAME, DASHBOARD_FILES.EXECUTABLES_RECORD_FILE_NAME);
}

function isRecordedPath(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.startsWith('/'));
}

export function executablesRecordOf(value: unknown): ExecutablesRecord | null {
  if (!UnknownValueUtil.isJsonObject(value)) return null;
  const { claude, agentProgress } = value;
  if (!isRecordedPath(claude) || !isRecordedPath(agentProgress)) return null;
  return { claude, agentProgress };
}

export function readExecutablesRecord(recordPath: string): ExecutablesRecordReading {
  let text: string;
  try {
    text = readFileSync(recordPath, 'utf8');
  } catch (error) {
    if (UnknownValueUtil.errorCodeOf(error) === 'ENOENT') return { kind: 'missing' };
    return { kind: 'unreadable', reason: UnknownValueUtil.errorMessageOf(error) };
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { kind: 'unreadable', reason: `not JSON: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  const record = executablesRecordOf(document);
  return record === null ? { kind: 'unreadable', reason: 'not an executables record' } : { kind: 'present', record };
}
