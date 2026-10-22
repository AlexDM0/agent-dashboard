/**
 * The record is how `open`, `stop` and `status` find the server, so a torn or foreign file must read as a verdict, never a
 * throw, and a stopping server must never remove a record a newer server wrote.
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { afterEach, expect, test }               from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchDirectory.ts';
import {
  dashboardDirectoryOf,
  readServerRecord,
  removeServerRecordOf,
  serverRecordPathOf,
  type ServerRecord,
  writeServerRecord,
} from './ServerRecordFile.ts';

const scratchHomes: string[] = [];

afterEach(() => {
  for (const home of scratchHomes.splice(0)) removeScratchDirectory(home);
});

function scratchHome(): string {
  const home = createScratchDirectory('record-home');
  scratchHomes.push(home);
  return home;
}

const EXAMPLE_RECORD: ServerRecord = {
  pid: 4242, port: 4811, url: 'http://127.0.0.1:4811', boardOrigin: 'http://127.0.0.1:4812', startedAt: '2026-09-18T20:11:03.000Z', version: '0.1.0'
};

test('a record an older dashboard wrote, without the board origin, still reads, its board origin null', () => {
  const home = scratchHome();
  mkdirSync(dashboardDirectoryOf(home), { recursive: true });
  const { boardOrigin: _boardOrigin, ...olderRecord } = EXAMPLE_RECORD;
  writeFileSync(serverRecordPathOf(home), JSON.stringify(olderRecord));
  expect(readServerRecord(home)).toEqual({ kind: 'present', record: { ...EXAMPLE_RECORD, boardOrigin: null } });
});

test('a written record reads back whole, its folder created and no temporary file left', () => {
  const home = scratchHome();
  writeServerRecord(home, EXAMPLE_RECORD);
  expect(readServerRecord(home)).toEqual({ kind: 'present', record: EXAMPLE_RECORD });
  expect(readdirSync(dashboardDirectoryOf(home))).toEqual(['server.json']);
});

test('no record is missing, and a malformed one is unreadable rather than a throw', () => {
  const home = scratchHome();
  expect(readServerRecord(home)).toEqual({ kind: 'missing' });
  mkdirSync(dashboardDirectoryOf(home), { recursive: true });
  writeFileSync(serverRecordPathOf(home), '{"pid":');
  expect(readServerRecord(home).kind).toBe('unreadable');
  writeFileSync(serverRecordPathOf(home), '{"pid":"4242"}');
  expect(readServerRecord(home).kind).toBe('unreadable');
});

test('removal by process id leaves an unreadable record in place and never throws', () => {
  const home = scratchHome();
  mkdirSync(serverRecordPathOf(home), { recursive: true });
  expect(() => removeServerRecordOf(home, EXAMPLE_RECORD.pid)).not.toThrow();
  expect(readServerRecord(home).kind).toBe('unreadable');
});

test('removal by process id leaves a record naming another process', () => {
  const home = scratchHome();
  writeServerRecord(home, EXAMPLE_RECORD);
  removeServerRecordOf(home, EXAMPLE_RECORD.pid + 1);
  expect(readServerRecord(home).kind).toBe('present');
  removeServerRecordOf(home, EXAMPLE_RECORD.pid);
  expect(readServerRecord(home)).toEqual({ kind: 'missing' });
});
