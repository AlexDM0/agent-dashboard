/**
 * A reader holding the file while it is replaced sees the whole old or the whole new content, never a prefix; a
 * successful write leaves no temporary file, a missing parent folder is created, and a failed write leaves the
 * previous file as it was.
 */
import {
  chmodSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join }     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchDirectory.ts';
import { writeFileAtomically }                            from './AtomicFile.ts';

const RUNNING_AS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const LARGE_CONTENT_REPEATS = 200_000;
const CONCURRENT_READ_COUNT = 40;

let directory = '';

beforeEach(() => {
  directory = createScratchDirectory('atomic-file');
});

afterEach(() => {
  chmodSync(directory, 0o700);
  removeScratchDirectory(directory);
});

test('a reader holding the file across the write sees the whole old content or the whole new one', async () => {
  const filePath = join(directory, 'example.json');
  const oldContent = 'old'.repeat(LARGE_CONTENT_REPEATS);
  const newContent = 'new'.repeat(LARGE_CONTENT_REPEATS);
  writeFileSync(filePath, oldContent);
  const concurrentReads = Array.from({ length: CONCURRENT_READ_COUNT }, () => readFile(filePath, 'utf8'));
  writeFileAtomically(filePath, newContent);
  const observed = await Promise.all(concurrentReads);
  expect(observed.filter((content) => content !== oldContent && content !== newContent)).toEqual([]);
  expect(readFileSync(filePath, 'utf8')).toBe(newContent);
});

test('a write creates the missing parent folder and leaves no temporary file beside the target', () => {
  const filePath = join(directory, 'example-folder', 'example.json');
  writeFileAtomically(filePath, '{"example":1}');
  writeFileAtomically(filePath, '{"example":2}');
  expect(readFileSync(filePath, 'utf8')).toBe('{"example":2}');
  expect(readdirSync(join(directory, 'example-folder'))).toEqual(['example.json']);
});

test.skipIf(RUNNING_AS_ROOT)('a write that cannot be performed throws and leaves the previous file as it was', () => {
  const filePath = join(directory, 'example.json');
  writeFileSync(filePath, '{"example":1}');
  chmodSync(directory, 0o500);
  expect(() => writeFileAtomically(filePath, '{"example":2}')).toThrow();
  chmodSync(directory, 0o700);
  expect(readFileSync(filePath, 'utf8')).toBe('{"example":1}');
  expect(readdirSync(directory)).toEqual(['example.json']);
});
