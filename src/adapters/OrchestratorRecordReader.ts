/**
 * A supervisor's record file to a verdict: present with every field of the right type, missing, or unreadable with a
 * reason. A damaged record never throws, and a damaged one beside a good one leaves the good one read.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join }                      from 'node:path';

import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }  from '../shared/constants/DashboardFiles.ts';

export interface OrchestratorRecord {
  trackerId:         string;
  root:              string;
  supervisorPid:     number;
  sessionPid:        number;
  sessionId:         string;
  socketPath:        string;
  /** The `claude_code_version` of the session's `init` line, null until that line arrived. */
  claudeCodeVersion: string | null;
  startedAt:         string;
}

export type OrchestratorRecordReading =
  | { kind: 'present'; record: OrchestratorRecord; recordPath: string }
  | { kind: 'missing'; recordPath: string }
  | { kind: 'unreadable'; recordPath: string; reason: string };

const TEXT_FIELDS = ['trackerId', 'root', 'sessionId', 'socketPath', 'startedAt'] as const;

const PROCESS_ID_FIELDS = ['supervisorPid', 'sessionPid'] as const;

export function orchestratorRecordOf(value: unknown): OrchestratorRecord | null {
  if (!UnknownValueUtil.isJsonObject(value)) return null;
  if (TEXT_FIELDS.some((field) => typeof value[field] !== 'string')) return null;
  if (PROCESS_ID_FIELDS.some((field) => !Number.isInteger(value[field]) || (value[field] as number) <= 0)) return null;
  const { claudeCodeVersion } = value;
  if (claudeCodeVersion !== null && typeof claudeCodeVersion !== 'string') return null;
  return {
    trackerId:     value['trackerId'] as string,
    root:          value['root'] as string,
    supervisorPid: value['supervisorPid'] as number,
    sessionPid:    value['sessionPid'] as number,
    sessionId:     value['sessionId'] as string,
    socketPath:    value['socketPath'] as string,
    claudeCodeVersion,
    startedAt:     value['startedAt'] as string,
  };
}

export function readOrchestratorRecord(recordPath: string): OrchestratorRecordReading {
  let text: string;
  try {
    text = readFileSync(recordPath, 'utf8');
  } catch (error) {
    if (UnknownValueUtil.errorCodeOf(error) === 'ENOENT') return { kind: 'missing', recordPath };
    return { kind: 'unreadable', recordPath, reason: UnknownValueUtil.errorMessageOf(error) };
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { kind: 'unreadable', recordPath, reason: `not JSON: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  const record = orchestratorRecordOf(document);
  return record === null ? { kind: 'unreadable', recordPath, reason: 'not an orchestrator record' } : { kind: 'present', record, recordPath };
}

/** Every record file in the folder, read; a folder that does not exist holds none. */
export function readOrchestratorRecords(orchestratorDirectory: string): OrchestratorRecordReading[] {
  let fileNames: string[];
  try {
    fileNames = readdirSync(orchestratorDirectory);
  } catch {
    return [];
  }
  return fileNames
    .filter((fileName) => fileName.endsWith(DASHBOARD_FILES.ORCHESTRATOR_RECORD_SUFFIX))
    .map((fileName) => readOrchestratorRecord(join(orchestratorDirectory, fileName)));
}
