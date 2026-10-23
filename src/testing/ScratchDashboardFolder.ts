/** A scratch stand-in for the dashboard's own folder: a `package.json` declaring packages and a `node_modules` holding some of them. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { requireScratchDirectory } from './ScratchDirectory.ts';

export interface ScratchDashboardFolderContents {
  declared:             readonly string[];
  installed:            readonly string[];
  /** Written instead of the generated `package.json`, to damage it. */
  packageDocumentText?: string;
}

export function writeScratchDashboardFolder(directory: string, contents: ScratchDashboardFolderContents): void {
  requireScratchDirectory(directory);
  const dependencies = Object.fromEntries(contents.declared.map((packageName) => [packageName, '1.0.0']));
  writeFileSync(join(directory, 'package.json'), contents.packageDocumentText ?? JSON.stringify({ name: 'example-dashboard', dependencies }));
  mkdirSync(join(directory, 'node_modules'), { recursive: true });
  for (const packageName of contents.installed) {
    const packageDirectory = join(directory, 'node_modules', packageName);
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0', main: 'index.js' }));
    writeFileSync(join(packageDirectory, 'index.js'), 'module.exports = {};\n');
  }
}
