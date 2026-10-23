/**
 * The record `setup.sh` writes is read at every command's start, so a missing, torn or hand-damaged one must come back
 * as a verdict rather than a throw, and a field that is neither an absolute path nor null makes the whole record
 * unreadable rather than half-trusted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';
import { afterEach, expect, test }  from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../testing/ScratchDirectory.ts';
import { executablesRecordPathOf, readExecutablesRecord } from './ExecutablesRecordReader.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function recordPathHolding(text: string | null): string {
  const home = createScratchDirectory('executables-record');
  scratchDirectories.push(home);
  const recordPath = executablesRecordPathOf(home);
  if (text !== null) {
    mkdirSync(dirname(recordPath), { recursive: true });
    writeFileSync(recordPath, text);
  }
  return recordPath;
}

test('the record lives beside the server record in the dashboard folder', () => {
  expect(executablesRecordPathOf('/home/example')).toBe(join('/home/example', '.agent-progress-monitor', 'agent-dashboard', 'executables.json'));
});

test('a record with absolute paths and nulls is present', () => {
  const recordPath = recordPathHolding(JSON.stringify({ claude: '/opt/example/claude', agentProgress: null }));
  expect(readExecutablesRecord(recordPath)).toEqual({ kind: 'present', record: { claude: '/opt/example/claude', agentProgress: null } });
});

test('no record file is missing', () => {
  expect(readExecutablesRecord(recordPathHolding(null))).toEqual({ kind: 'missing' });
});

test('a torn record is unreadable', () => {
  expect(readExecutablesRecord(recordPathHolding('{"claude": ')).kind).toBe('unreadable');
});

test('a relative path makes the record unreadable', () => {
  expect(readExecutablesRecord(recordPathHolding(JSON.stringify({ claude: 'bin/claude', agentProgress: null }))).kind).toBe('unreadable');
});

test('a missing field makes the record unreadable', () => {
  expect(readExecutablesRecord(recordPathHolding(JSON.stringify({ claude: '/opt/example/claude' }))).kind).toBe('unreadable');
});

test('a document that is not an object is unreadable', () => {
  expect(readExecutablesRecord(recordPathHolding('["/opt/example/claude"]')).kind).toBe('unreadable');
});
