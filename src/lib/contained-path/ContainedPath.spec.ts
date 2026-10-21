/**
 * The resolver is the one gate between a URL and the disk, so every way out of the folder is planted and refused: an
 * absolute path, a `..` segment in either separator, a NUL, and a symlink (file or folder) pointing outside. A symlink
 * that stays inside, and a nested file, prove the gate does not refuse what it should serve.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join }                                  from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchDirectory.ts';
import { resolveContainedPath }                           from './ContainedPath.ts';

let scratchDirectory = '';
let folder = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('contained-path');
  folder = join(scratchDirectory, 'served');
  mkdirSync(join(folder, 'nested'), { recursive: true });
  writeFileSync(join(folder, 'page.html'), '<p>Example Agency</p>');
  writeFileSync(join(folder, 'nested', 'style.css'), 'p {}');
  writeFileSync(join(scratchDirectory, 'secret.txt'), 'outside');
});

afterEach(() => removeScratchDirectory(scratchDirectory));

test('a file inside the folder resolves to its real path', () => {
  expect(resolveContainedPath(folder, 'page.html')).toEqual({ kind: 'contained', path: join(folder, 'page.html') });
  expect(resolveContainedPath(folder, 'nested/style.css')).toEqual({ kind: 'contained', path: join(folder, 'nested', 'style.css') });
});

test('an absolute path is refused even when it names a file inside the folder', () => {
  expect(resolveContainedPath(folder, join(folder, 'page.html'))).toEqual({ kind: 'refused', refusal: 'absolute' });
});

test('a parent segment is refused in either separator, whether or not it would land back inside', () => {
  expect(resolveContainedPath(folder, '../secret.txt')).toEqual({ kind: 'refused', refusal: 'parent-segment' });
  expect(resolveContainedPath(folder, 'nested/../page.html')).toEqual({ kind: 'refused', refusal: 'parent-segment' });
  expect(resolveContainedPath(folder, 'nested\\..\\..\\secret.txt')).toEqual({ kind: 'refused', refusal: 'parent-segment' });
});

test('a NUL character is refused before the disk is asked', () => {
  expect(resolveContainedPath(folder, 'page.html\0.png')).toEqual({ kind: 'refused', refusal: 'nul-character' });
});

test('a symlinked file pointing outside the folder is refused', () => {
  symlinkSync(join(scratchDirectory, 'secret.txt'), join(folder, 'escape.txt'));
  expect(resolveContainedPath(folder, 'escape.txt')).toEqual({ kind: 'refused', refusal: 'outside-folder' });
});

test('a symlinked folder pointing outside the folder is refused for every file beneath it', () => {
  symlinkSync(scratchDirectory, join(folder, 'escape'));
  expect(resolveContainedPath(folder, 'escape/secret.txt')).toEqual({ kind: 'refused', refusal: 'outside-folder' });
});

test('a sibling whose name starts with the folder name is outside it', () => {
  mkdirSync(`${folder}-sibling`);
  writeFileSync(`${folder}-sibling/page.html`, 'sibling');
  symlinkSync(`${folder}-sibling/page.html`, join(folder, 'sibling.html'));
  expect(resolveContainedPath(folder, 'sibling.html')).toEqual({ kind: 'refused', refusal: 'outside-folder' });
});

test('a symlink that stays inside the folder is served as the file it points at', () => {
  symlinkSync(join(folder, 'page.html'), join(folder, 'alias.html'));
  expect(resolveContainedPath(folder, 'alias.html')).toEqual({ kind: 'contained', path: join(folder, 'page.html') });
});

test('a missing file, a missing folder and an empty request are refused', () => {
  expect(resolveContainedPath(folder, 'absent.html')).toEqual({ kind: 'refused', refusal: 'missing' });
  expect(resolveContainedPath(join(scratchDirectory, 'absent'), 'page.html')).toEqual({ kind: 'refused', refusal: 'missing' });
  expect(resolveContainedPath(folder, '')).toEqual({ kind: 'refused', refusal: 'empty' });
});
