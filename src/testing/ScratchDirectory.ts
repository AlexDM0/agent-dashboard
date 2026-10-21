/**
 * Real folders under the system temp folder, the only places a spec points a home directory or a project at; resolved
 * through symlinks (`/private/var` rather than `/var` on macOS), so they compare equal to a path the code under test
 * resolved. Test-only.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir }                            from 'node:os';
import { isAbsolute, join, relative }        from 'node:path';

export function createScratchDirectory(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `agent-dashboard-${prefix}-`)));
}

/** `force`, so cleaning up after a test that failed before creating anything does not turn one red test into two. */
export function removeScratchDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

/** Throws, since its callers are spec helpers and a throw there fails the spec before anything reads or writes a live home. */
export function requireScratchDirectory(directory: string): void {
  const pathFromScratchRoot = relative(realpathSync(tmpdir()), realpathSync(directory));
  if (pathFromScratchRoot === '' || pathFromScratchRoot.startsWith('..') || isAbsolute(pathFromScratchRoot)) {
    throw new Error(`A spec pointed the dashboard at ${directory}, outside the scratch root; use src/testing/ScratchDirectory.ts.`);
  }
}
