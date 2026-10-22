/**
 * The server reconnects to supervisors from these records, so a good record must read whole, a missing or damaged one
 * must be a verdict rather than a throw, a damaged one must not hide a good sibling, and only record files are read.
 */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory }  from '../testing/ScratchDirectory.ts';
import { readOrchestratorRecord, readOrchestratorRecords } from './OrchestratorRecordReader.ts';

const EXAMPLE_RECORD = {
  trackerId:         'example-tracker',
  root:              '/Users/alex.example/development/example-agency',
  supervisorPid:     4100,
  sessionPid:        4101,
  sessionId:         '00000000-0000-4000-8000-000000000001',
  socketPath:        '/tmp/example.sock',
  claudeCodeVersion: null,
  startedAt:         '2026-10-22T10:00:00.000Z',
};

let directory = '';

beforeEach(() => {
  directory = createScratchDirectory('orchestrator-records');
});

afterEach(() => {
  removeScratchDirectory(directory);
});

test('a whole record reads as present with every field', () => {
  const recordPath = join(directory, 'example.json');
  writeFileSync(recordPath, JSON.stringify(EXAMPLE_RECORD));
  expect(readOrchestratorRecord(recordPath)).toEqual({ kind: 'present', record: EXAMPLE_RECORD, recordPath });
});

test('a missing record is missing and a damaged one unreadable, never a throw', () => {
  const missingPath = join(directory, 'missing.json');
  expect(readOrchestratorRecord(missingPath)).toEqual({ kind: 'missing', recordPath: missingPath });
  const damagedPath = join(directory, 'damaged.json');
  writeFileSync(damagedPath, '{"trackerId":');
  expect(readOrchestratorRecord(damagedPath).kind).toBe('unreadable');
  const wrongPath = join(directory, 'wrong.json');
  writeFileSync(wrongPath, JSON.stringify({ ...EXAMPLE_RECORD, supervisorPid: 'not a pid' }));
  expect(readOrchestratorRecord(wrongPath).kind).toBe('unreadable');
});

test('a damaged record beside a good one leaves the good one read, and only record files are read', () => {
  writeFileSync(join(directory, 'good.json'), JSON.stringify(EXAMPLE_RECORD));
  writeFileSync(join(directory, 'damaged.json'), 'not json');
  writeFileSync(join(directory, 'good.log'), 'a log line');
  const kinds = readOrchestratorRecords(directory).map((reading) => reading.kind).sort();
  expect(kinds).toEqual(['present', 'unreadable']);
  expect(readOrchestratorRecords(join(directory, 'no-such-folder'))).toEqual([]);
});
