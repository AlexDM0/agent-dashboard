/**
 * Which packages a folder's `package.json` declares under `dependencies` that do not resolve from that folder, so a
 * server can say a missing install is why its page cannot build instead of serving it empty.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';

export type DependencyResolution =
  | { kind: 'resolvable' }
  | { kind: 'unresolvable'; packageNames: string[] }
  | { kind: 'unreadable'; reason: string };

function declaredDependencyNamesOf(packageDocumentPath: string): string[] | { reason: string } {
  let packageDocument: unknown;
  try {
    packageDocument = JSON.parse(readFileSync(packageDocumentPath, 'utf8'));
  } catch (error) {
    return { reason: `${packageDocumentPath} cannot be read as JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!UnknownValueUtil.isJsonObject(packageDocument)) return { reason: `${packageDocumentPath} is not a JSON object` };
  const { dependencies } = packageDocument;
  if (dependencies === undefined) return [];
  if (!UnknownValueUtil.isJsonObject(dependencies)) return { reason: `the dependencies of ${packageDocumentPath} are not an object` };
  return Object.keys(dependencies);
}

function resolvesFrom(directory: string, packageName: string): boolean {
  try {
    Bun.resolveSync(packageName, directory);
    return true;
  } catch {
    return false;
  }
}

export function readDependencyResolution(directory: string): DependencyResolution {
  const declaredNames = declaredDependencyNamesOf(join(directory, 'package.json'));
  if (!Array.isArray(declaredNames)) return { kind: 'unreadable', reason: declaredNames.reason };
  const packageNames = declaredNames.filter((packageName) => !resolvesFrom(directory, packageName));
  return packageNames.length === 0 ? { kind: 'resolvable' } : { kind: 'unresolvable', packageNames };
}
