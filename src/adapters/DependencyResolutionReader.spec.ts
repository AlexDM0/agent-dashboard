/**
 * The server decides from this verdict whether `/` is the dashboard or the page naming a missing install, so a declared
 * package absent from `node_modules` must be named, an installed one must not, and a damaged `package.json` must come
 * back as a verdict rather than a throw that takes the server down.
 */
import { afterEach, expect, test } from 'bun:test';

import { writeScratchDashboardFolder }                    from '../testing/ScratchDashboardFolder.ts';
import { createScratchDirectory, removeScratchDirectory } from '../testing/ScratchDirectory.ts';
import { readDependencyResolution }                       from './DependencyResolutionReader.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchFolder(): string {
  const directory = createScratchDirectory('dependency-resolution');
  scratchDirectories.push(directory);
  return directory;
}

test('every declared package installed in node_modules is resolvable', () => {
  const directory = scratchFolder();
  writeScratchDashboardFolder(directory, { declared: ['example-installed-package'], installed: ['example-installed-package'] });
  expect(readDependencyResolution(directory)).toEqual({ kind: 'resolvable' });
});

test('a declared package absent from node_modules is named, and only it', () => {
  const directory = scratchFolder();
  writeScratchDashboardFolder(directory, { declared: ['example-installed-package', 'example-missing-package'], installed: ['example-installed-package'] });
  expect(readDependencyResolution(directory)).toEqual({ kind: 'unresolvable', packageNames: ['example-missing-package'] });
});

test('a package.json without dependencies is resolvable', () => {
  const directory = scratchFolder();
  writeScratchDashboardFolder(directory, { declared: [], installed: [] });
  expect(readDependencyResolution(directory)).toEqual({ kind: 'resolvable' });
});

test('a torn package.json is unreadable, not a throw', () => {
  const directory = scratchFolder();
  writeScratchDashboardFolder(directory, { declared: [], installed: [], packageDocumentText: '{"dependencies": ' });
  expect(readDependencyResolution(directory).kind).toBe('unreadable');
});

test('a folder without a package.json is unreadable', () => {
  expect(readDependencyResolution(scratchFolder()).kind).toBe('unreadable');
});
