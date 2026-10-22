/**
 * The detached process holding one dashboard-owned orchestrator session: it runs `claude -p` in stream-json in the
 * project root, serves its state and output on a Unix socket to any server that connects, holds `AskUserQuestion`
 * requests until answered, denies every other permission prompt, and ends with the session, removing its record and socket.
 */
import { spawn }                                  from 'node:child_process';
import { randomUUID }                             from 'node:crypto';
import { appendFileSync, mkdirSync, rmSync }      from 'node:fs';
import { type Server, type Socket, createServer } from 'node:net';
import { dirname }                                from 'node:path';
import { createInterface }                        from 'node:readline';

import type { OrchestratorRecord }   from '../adapters/OrchestratorRecordReader.ts';
import { chatMessagesOfSessionLine } from '../adapters/SessionChatMessageMapper.ts';
import { sessionMessageLineOf }      from '../adapters/SessionMessageWriter.ts';
import { sessionStreamEventOf }      from '../adapters/SessionStreamEventMapper.ts';
import {
  type ConversationEntry,
  type SupervisorConversation,
  type SupervisorRequest,
  type SupervisorState,
  supervisorRequestOf
} from '../adapters/SupervisorLineReader.ts';
import { writeFileAtomically } from '../lib/atomic-file/AtomicFile.ts';
import type {
  ChatMessage,
  ContextUsage,
  OrchestratorState,
  PendingQuestion
} from '../shared/DashboardContract.ts';
import { orchestratorFilePathsOf } from '../shared/OrchestratorFilePaths.ts';
import { UnknownValueUtil }        from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_LIMITS }        from '../shared/constants/DashboardLimits.ts';

export interface OrchestratorSupervisorOptions {
  trackerId:             string;
  root:                  string;
  claudeExecutable:      string;
  orchestratorDirectory: string;
  supervisorPid:         number;
  clock:                 () => Date;
  stopGraceMilliseconds: number;
}

export type OrchestratorSupervisorEnd =
  | { kind: 'ended'; sessionId: string; exitCode: number | null; signal: string | null }
  | { kind: 'refused'; reason: string };

/** Auto mode, so only `AskUserQuestion` reaches the supervisor; the prompt tool `stdio` sends it as a `control_request`. */
export const CLAUDE_SESSION_ARGUMENTS = [
  '-p',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--permission-mode',
  'auto',
  '--permission-prompt-tool',
  'stdio',
] as const;

interface HeldQuestion { pending: PendingQuestion; input: Record<string, unknown> }

function listening(listener: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(socketPath, () => {
      listener.off('error', reject);
      resolve();
    });
  });
}

function controlResponseLineOf(requestId: string, response: Record<string, unknown>): string {
  return `${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } })}\n`;
}

/** Resolves when the session has ended; a refusal (socket path too long, the executable not starting) spawns or leaves nothing. */
export async function superviseOrchestrator(options: OrchestratorSupervisorOptions): Promise<OrchestratorSupervisorEnd> {
  const paths = orchestratorFilePathsOf(options.orchestratorDirectory, options.trackerId);
  if (Buffer.byteLength(paths.socketPath) > DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES) {
    return { kind: 'refused', reason: `The socket path ${paths.socketPath} is longer than ${DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES} bytes` };
  }
  mkdirSync(dirname(paths.socketPath), { recursive: true });
  // A socket file outlives a supervisor that was killed; the server starts a new one only when no record lives.
  rmSync(paths.socketPath, { force: true });

  const sessionId = randomUUID();
  const session = spawn(options.claudeExecutable, [...CLAUDE_SESSION_ARGUMENTS, '--session-id', sessionId], {
    cwd:      options.root,
    detached: true,
    stdio:    ['pipe', 'pipe', 'inherit'],
  });
  const spawnFailure = new Promise<string>((resolve) => session.once('error', (error) => resolve(UnknownValueUtil.errorMessageOf(error))));
  const sessionPid = session.pid;
  if (sessionPid === undefined) return { kind: 'refused', reason: `${options.claudeExecutable} did not start: ${await spawnFailure}` };
  const sessionGroupId = -sessionPid;
  const sessionClosed = new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    session.once('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });

  const record: OrchestratorRecord = {
    trackerId:         options.trackerId,
    root:              options.root,
    supervisorPid:     options.supervisorPid,
    sessionPid,
    sessionId,
    socketPath:        paths.socketPath,
    claudeCodeVersion: null,
    startedAt:         options.clock().toISOString(),
  };
  const clients = new Set<Socket>();
  const heldQuestions = new Map<string, HeldQuestion>();
  const conversation: ConversationEntry[] = [];
  let latestSequence = 0;
  const contextWindowTokensByModel: Record<string, number> = {};
  let context: ContextUsage | null = null;
  let turnRunning = false;
  let ended = false;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  function currentState(): OrchestratorState {
    if (ended) return 'ended';
    if (heldQuestions.size > 0) return 'waiting-for-answer';
    return turnRunning ? 'busy' : 'idle';
  }

  function stateLine(): string {
    const state: SupervisorState = {
      kind:             'state',
      record,
      state:            currentState(),
      context,
      pendingQuestions: [...heldQuestions.values()].map((held) => held.pending),
    };
    return `${JSON.stringify(state)}\n`;
  }

  function broadcast(line: string): void {
    // A net socket queues whatever the kernel does not take at once, so a long line is never cut short.
    for (const client of clients) client.write(line);
  }

  function conversationLine(conversationLineContent: SupervisorConversation): string {
    return `${JSON.stringify(conversationLineContent)}\n`;
  }

  function addToConversation(message: ChatMessage): void {
    latestSequence += 1;
    const entry: ConversationEntry = { sequence: latestSequence, message };
    conversation.push(entry);
    if (conversation.length > DASHBOARD_LIMITS.CONVERSATION_HISTORY_MESSAGE_COUNT) conversation.shift();
    broadcast(conversationLine({ kind: 'message', entry }));
  }

  function appendHistory(origin: 'session' | 'client', line: string): void {
    try {
      appendFileSync(paths.historyPath, `${JSON.stringify({ at: options.clock().toISOString(), origin, line })}\n`);
    } catch {
      // The history is for a later reader; losing a line must not end the session.
    }
  }

  function writeToSession(line: string): void {
    if (session.stdin.writable) session.stdin.write(line);
  }

  function stopSession(): void {
    if (stopTimer !== null || ended) return;
    session.stdin.end();
    stopTimer = setTimeout(() => {
      try {
        process.kill(sessionGroupId, 'SIGTERM');
      } catch {
        // The session's group is already gone.
      }
    }, options.stopGraceMilliseconds);
  }

  function handleRequest(request: SupervisorRequest): void {
    switch (request.kind) {
      case 'chat':
        writeToSession(sessionMessageLineOf(request.text));
        addToConversation({ at: options.clock().toISOString(), role: 'user', text: request.text });
        turnRunning = true;
        break;
      case 'answer': {
        const held = heldQuestions.get(request.requestId);
        if (held === undefined) return;
        heldQuestions.delete(request.requestId);
        writeToSession(controlResponseLineOf(request.requestId, { behavior: 'allow', updatedInput: { ...held.input, answers: request.answers } }));
        break;
      }
      case 'stop':
        stopSession();
        return;
    }
    broadcast(stateLine());
  }

  function handleSessionLine(line: string): void {
    appendHistory('session', line);
    for (const message of chatMessagesOfSessionLine(line, options.clock().toISOString())) addToConversation(message);
    const event = sessionStreamEventOf(line);
    switch (event.kind) {
      case 'init':
        record.claudeCodeVersion = event.claudeCodeVersion;
        writeFileAtomically(paths.recordPath, `${JSON.stringify(record, null, 2)}\n`);
        return;
      case 'assistant-usage':
        context = {
          usedTokens: event.usedTokens, contextWindowTokens: contextWindowTokensByModel[event.model] ?? null, model: event.model, measuredAt: options.clock().toISOString()
        };
        break;
      case 'result':
        Object.assign(contextWindowTokensByModel, event.contextWindowTokensByModel);
        if (context !== null) context = { ...context, contextWindowTokens: contextWindowTokensByModel[context.model] ?? context.contextWindowTokens };
        turnRunning = false;
        break;
      case 'question':
        heldQuestions.set(event.requestId, { pending: { requestId: event.requestId, askedAt: options.clock().toISOString(), questions: event.questions }, input: event.input });
        break;
      case 'permission-request':
        writeToSession(controlResponseLineOf(event.requestId, { behavior: 'deny', message: 'Permission prompts are not answered for a dashboard-owned session.' }));
        return;
      case 'other':
        return;
    }
    broadcast(stateLine());
  }

  function serveClient(client: Socket): void {
    clients.add(client);
    client.setEncoding('utf8');
    let unfinishedLine = '';
    client.on('data', (chunk: string) => {
      const lines = `${unfinishedLine}${chunk}`.split('\n');
      unfinishedLine = lines.pop() ?? '';
      for (const line of lines) {
        const request = supervisorRequestOf(line);
        if (request === null) continue;
        appendHistory('client', line);
        handleRequest(request);
      }
    });
    client.on('error', () => clients.delete(client));
    client.on('close', () => clients.delete(client));
    client.write(conversationLine({ kind: 'history', entries: conversation }));
    client.write(stateLine());
  }

  const listener = createServer(serveClient);
  try {
    await listening(listener, paths.socketPath);
  } catch (error) {
    process.kill(sessionGroupId, 'SIGTERM');
    return { kind: 'refused', reason: `The socket ${paths.socketPath} did not listen: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  writeFileAtomically(paths.recordPath, `${JSON.stringify(record, null, 2)}\n`);
  createInterface({ input: session.stdout }).on('line', handleSessionLine);
  session.stdin.on('error', () => {});

  const { exitCode, signal } = await sessionClosed;
  ended = true;
  if (stopTimer !== null) clearTimeout(stopTimer);
  rmSync(paths.recordPath, { force: true });
  broadcast(stateLine());
  for (const client of clients) client.end();
  listener.close();
  rmSync(paths.socketPath, { force: true });
  return {
    kind: 'ended', sessionId, exitCode, signal
  };
}
