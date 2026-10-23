/**
 * Hands a project's dashboard-owned orchestrator over to a fresh one: the running session is asked for a handoff note,
 * the note is kept in the dashboard's own handoffs folder, the session is stopped, and a fresh one starts in the same
 * root with the note as its first message. Until the note is kept nothing is stopped, so a failure there leaves the old
 * session running and starts nothing.
 */
import { join } from 'node:path';

import { writeFileAtomically }       from '../lib/atomic-file/AtomicFile.ts';
import type { OrchestratorSession }  from '../shared/DashboardContract.ts';
import { UnknownValueUtil }          from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }           from '../shared/constants/DashboardFiles.ts';
import { ORCHESTRATE_SKILL_COMMAND } from './OrchestratorRequestMessage.ts';
import type { OrchestratorSessions } from './OrchestratorSessions.ts';

export const HANDOFF_NOTE_REQUEST = [
  'Your context is filling up, so the dashboard is handing this board over to a fresh orchestrator session.',
  'Reply with a handoff note and nothing else, as plain text, without running any tool: what is in flight, what you were',
  'weighing, the decisions taken and still open, and the next concrete steps. This session is stopped once you reply.',
].join(' ');

export interface OrchestratorHandoffRequest {
  orchestratorSessions:     OrchestratorSessions;
  handoffDirectory:         string;
  trackerId:                string;
  root:                     string;
  previousSession:          OrchestratorSession;
  /** Stamps the note's file name; it decides nothing. */
  now:                      Date;
  replyTimeoutMilliseconds: number;
  endTimeoutMilliseconds:   number;
}

export type OrchestratorHandoff =
  | { kind: 'handed-off'; session: OrchestratorSession; notePath: string }
  /** `oldSessionRuns` is true while nothing was stopped: the failure came before the note was kept. */
  | { kind: 'failed'; reason: string; oldSessionRuns: boolean };

export function handoffDirectoryOf(homeDirectory: string): string {
  return join(homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME, DASHBOARD_FILES.DASHBOARD_DIRECTORY_NAME, DASHBOARD_FILES.HANDOFFS_DIRECTORY_NAME);
}

/** The tracker id is outside text, so anything but a file-name-safe character becomes a dash and no name leaves the folder. */
export function handoffNotePathOf(handoffDirectory: string, trackerId: string, now: Date): string {
  const safeTrackerId = trackerId.replaceAll(/[^A-Za-z0-9_-]/g, '-');
  const stamp = now.toISOString().replaceAll(':', '-');
  return join(handoffDirectory, `${safeTrackerId}-${stamp}${DASHBOARD_FILES.HANDOFF_NOTE_SUFFIX}`);
}

export function freshSessionMessageOf(previousSessionId: string, notePath: string, note: string): string {
  return [
    ORCHESTRATE_SKILL_COMMAND,
    `You continue the previous orchestrator's work on this board: session ${previousSessionId} handed it over to you as its`,
    `context filled up. Its handoff note follows, also kept at ${notePath}. Read the board before you act on it.`,
    '',
    note,
  ].join('\n');
}

export async function handOffOrchestrator(request: OrchestratorHandoffRequest): Promise<OrchestratorHandoff> {
  const { orchestratorSessions, trackerId, previousSession } = request;
  const reply = await orchestratorSessions.replyTo(trackerId, HANDOFF_NOTE_REQUEST, request.replyTimeoutMilliseconds);
  if (reply.kind === 'failed') return { kind: 'failed', reason: reply.reason, oldSessionRuns: true };

  const notePath = handoffNotePathOf(request.handoffDirectory, trackerId, request.now);
  try {
    writeFileAtomically(notePath, `${reply.text}\n`);
  } catch (error) {
    return { kind: 'failed', reason: `The refresh note could not be kept: ${UnknownValueUtil.errorMessageOf(error)}`, oldSessionRuns: true };
  }

  const end = await orchestratorSessions.stopAndAwaitEnd(trackerId, request.endTimeoutMilliseconds);
  if (end.kind === 'failed') return { kind: 'failed', reason: `${end.reason}; the note is kept at ${notePath}`, oldSessionRuns: false };

  const firstMessage = freshSessionMessageOf(previousSession.sessionId, notePath, reply.text);
  const launch = await orchestratorSessions.launch(trackerId, request.root, firstMessage, previousSession.sessionId);
  if (launch.kind === 'started') return { kind: 'handed-off', session: launch.session, notePath };
  const reason = launch.kind === 'running' ? 'Another orchestrator of this project started meanwhile' : launch.reason;
  return { kind: 'failed', reason: `${reason}; the note is kept at ${notePath}`, oldSessionRuns: false };
}
