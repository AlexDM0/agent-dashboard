/**
 * A watched Claude Code session's context usage, read from the newest `assistant` line of its transcript
 * `~/.claude/projects/<slug of its cwd>/<sessionId>.jsonl`. Only the transcript's tail is read, so a transcript of any
 * size costs one bounded read; a missing, unreadable or usage-free tail is a verdict, never a throw.
 */
import {
  closeSync,
  fstatSync,
  openSync,
  readSync
} from 'node:fs';
import { join, resolve } from 'node:path';

import { type ContextUsage } from '../shared/DashboardContract.ts';
import { UnknownValueUtil }  from '../shared/UnknownValueUtil.ts';

export type TranscriptUsageVerdict = { kind: 'measured'; usage: ContextUsage } | { kind: 'unknown'; reason: string };

export interface TranscriptLocation {
  homeDirectory: string;
  cwd:           string;
  sessionId:     string;
}

/** Everything outside `[a-zA-Z0-9]` becomes `-` in the folder Claude Code names after a session's working directory. */
const CHARACTER_THE_SLUG_REPLACES = /[^a-zA-Z0-9]/g;

/** A session id is a file name; anything else could reach outside the transcript folder. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Claude Code's own placeholder turns (an API error, an interruption) carry no real usage. */
const SYNTHETIC_MODEL = '<synthetic>';

/** The folder holding the transcripts of every session that ran in `cwd`. */
export function claudeProjectFolderOf(homeDirectory: string, cwd: string): string {
  return join(homeDirectory, '.claude', 'projects', resolve(cwd).replace(CHARACTER_THE_SLUG_REPLACES, '-'));
}

interface TranscriptTail {
  text:       string;
  modifiedAt: string;
}

/** The last `tailBytes` of the file, the partial line it starts inside dropped. Throws for a file it cannot read. */
function transcriptTailOf(path: string, tailBytes: number): TranscriptTail {
  const descriptor = openSync(path, 'r');
  try {
    const { size, mtime } = fstatSync(descriptor);
    // One byte before the tail is read too, so a line starting exactly at the bound is kept whole.
    const start = Math.max(0, size - tailBytes - 1);
    const buffer = Buffer.alloc(size - start);
    const readByteCount = readSync(descriptor, buffer, 0, buffer.length, start);
    const text = buffer.subarray(0, readByteCount).toString('utf8');
    return { text: start === 0 ? text : text.slice(text.indexOf('\n') + 1), modifiedAt: mtime.toISOString() };
  } finally {
    closeSync(descriptor);
  }
}

function tokenCountOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** The usage an `assistant` line carries, or null for any other line. */
function usageOfLine(line: string, modifiedAt: string): ContextUsage | null {
  let document: unknown;
  try {
    document = JSON.parse(line);
  } catch {
    return null;
  }
  if (!UnknownValueUtil.isJsonObject(document) || document['type'] !== 'assistant') return null;
  const { message, timestamp } = document;
  if (!UnknownValueUtil.isJsonObject(message) || !UnknownValueUtil.isJsonObject(message['usage'])) return null;
  const { model, usage } = message;
  if (typeof model !== 'string' || model.length === 0 || model === SYNTHETIC_MODEL) return null;
  const inputTokens = tokenCountOf(usage['input_tokens']);
  if (inputTokens === null) return null;
  const cacheReadTokens = tokenCountOf(usage['cache_read_input_tokens']) ?? 0;
  const cacheCreationTokens = tokenCountOf(usage['cache_creation_input_tokens']) ?? 0;
  return {
    usedTokens:          inputTokens + cacheReadTokens + cacheCreationTokens,
    contextWindowTokens: null,
    model,
    measuredAt:          typeof timestamp === 'string' && timestamp.length > 0 ? timestamp : modifiedAt,
  };
}

/** The window is null here: a transcript carries none, and only a dashboard-owned session reports one. */
export function readTranscriptUsage(location: TranscriptLocation, tailBytes: number): TranscriptUsageVerdict {
  if (!SESSION_ID_PATTERN.test(location.sessionId)) return { kind: 'unknown', reason: `The session id ${location.sessionId} names no transcript` };
  const transcriptPath = join(claudeProjectFolderOf(location.homeDirectory, location.cwd), `${location.sessionId}.jsonl`);
  let tail: TranscriptTail;
  try {
    tail = transcriptTailOf(transcriptPath, tailBytes);
  } catch (error) {
    return { kind: 'unknown', reason: `The transcript ${transcriptPath} cannot be read: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  const lines = tail.text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const usage = usageOfLine(lines[i] ?? '', tail.modifiedAt);
    if (usage !== null) return { kind: 'measured', usage };
  }
  return { kind: 'unknown', reason: `The last ${tailBytes} bytes of ${transcriptPath} hold no assistant usage` };
}
