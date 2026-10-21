/**
 * Replaces a file in one step, so no reader ever sees a half-written one: the bytes go to a temporary file beside the
 * target (a rename across filesystems is a copy, and a copy is not atomic), are flushed, and are renamed over it.
 */
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync
} from 'node:fs';
import { dirname } from 'node:path';

const TEMPORARY_NAME_RANDOM_CHARACTERS = 8;

/** The parent folder is created when missing; a failed write throws and leaves the previous file untouched. */
export function writeFileAtomically(targetPath: string, contents: string): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID().slice(0, TEMPORARY_NAME_RANDOM_CHARACTERS)}.tmp`;
  try {
    const temporaryFileDescriptor = openSync(temporaryPath, 'w');
    try {
      writeSync(temporaryFileDescriptor, contents);
      fsyncSync(temporaryFileDescriptor);
    } finally {
      closeSync(temporaryFileDescriptor);
    }
    renameSync(temporaryPath, targetPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The rename may already have consumed the path, and cleaning up must not replace the original error.
    }
    throw error;
  }
}
