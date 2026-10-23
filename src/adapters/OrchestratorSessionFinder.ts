/**
 * Finds the live Claude Code session orchestrating a board from the files every session writes: its record in
 * `~/.claude/sessions/<pid>.json` and its workflow transcripts in `~/.claude/projects/<slug>/<sessionId>/`. The one
 * session whose transcripts hold the board's latest dispatcher run, else the one live session in the project root; any
 * other count is a refusal, never a guess.
 */
import {
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from 'node:fs';
import { join, resolve } from 'node:path';

import { processIsAlive }        from '../lib/process-liveness/ProcessIsAlive.ts';
import { UnknownValueUtil }      from '../shared/UnknownValueUtil.ts';
import { claudeProjectFolderOf } from './TranscriptUsageReader.ts';

export interface LiveSession {
  pid:                 number;
  sessionId:           string;
  cwd:                 string;
  messagingSocketPath: string;
  name:                string | null;
  status:              string | null;
  startedAt:           string | null;
}

export type OrchestratorSessionVerdict = { kind: 'found'; session: LiveSession } | { kind: 'refused'; reason: string };

export interface OrchestratorSearch {
  homeDirectory:   string;
  projectRoot:     string;
  dispatcherRunId: string | null;
  socketAccepts:   (socketPath: string) => Promise<boolean>;
}

export interface WatchedSessionSearch {
  homeDirectory:    string;
  /** The board's latest dispatcher run; null, or a run id that is no plain folder name, watches no session. */
  dispatcherRunId:  string | null;
  /** Whether the dashboard started the session, by its pid or its session id; such a session is never also watched. */
  isDashboardOwned: (session: LiveSession) => boolean;
}

const SESSION_FILE_SUFFIX = '.json';

/** A run id is a folder name; anything else could reach outside the transcript folder. */
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sessionOf(document: unknown): LiveSession | null {
  if (!UnknownValueUtil.isJsonObject(document)) return null;
  const {
    pid, sessionId, cwd, messagingSocketPath, name, status, startedAt
  } = document;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
  if (typeof sessionId !== 'string' || typeof cwd !== 'string' || typeof messagingSocketPath !== 'string') return null;
  if (sessionId.length === 0 || cwd.length === 0 || messagingSocketPath.length === 0) return null;
  return {
    pid, sessionId, cwd, messagingSocketPath, name: textOrNull(name), status: textOrNull(status), startedAt: textOrNull(startedAt)
  };
}

/** Fail closed: a folder or file that cannot be read, or holds no session record, is no session. */
function recordedSessions(homeDirectory: string): LiveSession[] {
  const sessionsDirectory = join(homeDirectory, '.claude', 'sessions');
  let fileNames: string[];
  try {
    fileNames = readdirSync(sessionsDirectory).filter((fileName) => fileName.endsWith(SESSION_FILE_SUFFIX));
  } catch {
    return [];
  }
  const sessions: LiveSession[] = [];
  for (const fileName of fileNames) {
    try {
      const session = sessionOf(JSON.parse(readFileSync(join(sessionsDirectory, fileName), 'utf8')));
      if (session !== null) sessions.push(session);
    } catch {
      // A record being rewritten or removed as it is read is no session.
    }
  }
  return sessions;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function canonicalPathOf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function holdsWorkflowRun(homeDirectory: string, session: LiveSession, runId: string): boolean {
  return isDirectory(join(claudeProjectFolderOf(homeDirectory, session.cwd), session.sessionId, 'subagents', 'workflows', runId));
}

async function reachable(sessions: LiveSession[], socketAccepts: OrchestratorSearch['socketAccepts']): Promise<LiveSession[]> {
  const accepting = await Promise.all(sessions.map((session) => socketAccepts(session.messagingSocketPath)));
  return sessions.filter((_session, index) => accepting[index] === true);
}

function pidsOf(sessions: LiveSession[]): string {
  return sessions.map((session) => session.pid).join(', ');
}

export async function findOrchestratorSession(search: OrchestratorSearch): Promise<OrchestratorSessionVerdict> {
  const liveSessions = recordedSessions(search.homeDirectory).filter((session) => processIsAlive(session.pid));

  const runId = search.dispatcherRunId;
  if (runId !== null && RUN_ID_PATTERN.test(runId)) {
    const runHolders = await reachable(liveSessions.filter((session) => holdsWorkflowRun(search.homeDirectory, session, runId)), search.socketAccepts);
    const [onlyRunHolder] = runHolders;
    if (runHolders.length === 1 && onlyRunHolder !== undefined) return { kind: 'found', session: onlyRunHolder };
    if (runHolders.length > 1) {
      return { kind: 'refused', reason: `Several live Claude Code sessions (pids ${pidsOf(runHolders)}) hold dispatcher run ${runId}; none was chosen` };
    }
  }

  const projectRoot = canonicalPathOf(search.projectRoot);
  const rootSessions = await reachable(liveSessions.filter((session) => canonicalPathOf(session.cwd) === projectRoot), search.socketAccepts);
  const [onlyRootSession] = rootSessions;
  if (rootSessions.length === 1 && onlyRootSession !== undefined) return { kind: 'found', session: onlyRootSession };
  if (rootSessions.length > 1) {
    return {
      kind:   'refused',
      reason: `Several live Claude Code sessions (pids ${pidsOf(rootSessions)}) run in ${search.projectRoot} and none holds the board's dispatcher run; none was chosen`,
    };
  }
  return { kind: 'refused', reason: `No live Claude Code session orchestrates ${search.projectRoot}: none holds its dispatcher run or runs in its root` };
}

/**
 * Every live session holding the board's dispatcher run, wherever its cwd, but the dashboard-owned ones, by session id;
 * no socket is probed.
 */
export function findWatchedSessions(search: WatchedSessionSearch): LiveSession[] {
  const runId = search.dispatcherRunId;
  if (runId === null || !RUN_ID_PATTERN.test(runId)) return [];
  return recordedSessions(search.homeDirectory)
    .filter((session) => !search.isDashboardOwned(session) && holdsWorkflowRun(search.homeDirectory, session, runId) && processIsAlive(session.pid))
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}
