/**
 * Resolves a requested relative path inside a folder, refusing anything that could name a file outside it: an absolute
 * path, a `..` segment, a NUL character, or a path whose symlinks resolve beyond the folder's own real path.
 */
import { realpathSync } from 'node:fs';
import {
  isAbsolute,
  join,
  sep,
  win32
} from 'node:path';

export type ContainedPathRefusal = 'empty' | 'absolute' | 'parent-segment' | 'nul-character' | 'outside-folder' | 'missing';

export type ContainedPathVerdict =
  | { kind: 'contained'; path: string }
  | { kind: 'refused'; refusal: ContainedPathRefusal };

const NUL_CHARACTER = '\0';

const PARENT_SEGMENT = '..';

function realPathOf(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

/** The answer is the requested file's real path, symlinks resolved, so the caller opens exactly what was checked. */
export function resolveContainedPath(folder: string, requestedPath: string): ContainedPathVerdict {
  if (requestedPath.length === 0) return { kind: 'refused', refusal: 'empty' };
  if (requestedPath.includes(NUL_CHARACTER)) return { kind: 'refused', refusal: 'nul-character' };
  if (isAbsolute(requestedPath) || win32.isAbsolute(requestedPath)) return { kind: 'refused', refusal: 'absolute' };
  if (requestedPath.split(/[/\\]/).includes(PARENT_SEGMENT)) return { kind: 'refused', refusal: 'parent-segment' };

  const folderRealPath = realPathOf(folder);
  if (folderRealPath === null) return { kind: 'refused', refusal: 'missing' };
  const requestedRealPath = realPathOf(join(folderRealPath, requestedPath));
  if (requestedRealPath === null) return { kind: 'refused', refusal: 'missing' };

  const folderPrefix = folderRealPath.endsWith(sep) ? folderRealPath : `${folderRealPath}${sep}`;
  if (requestedRealPath !== folderRealPath && !requestedRealPath.startsWith(folderPrefix)) {
    return { kind: 'refused', refusal: 'outside-folder' };
  }
  return { kind: 'contained', path: requestedRealPath };
}
