/**
 * The server's side of the dashboard-owned sessions of one role: it starts a detached supervisor per session, up to the
 * role's limit per project, connects to every supervisor of its role whose record lives (again after a server restart),
 * holds each session's latest state, and sends chat and stop to it. Closing it disconnects and leaves every supervisor
 * running. Nothing here throws on a supervisor gone.
 */
import { spawn }      from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  rmSync
} from 'node:fs';
import { type Socket, createConnection } from 'node:net';

import { type OrchestratorRecord, readOrchestratorRecord, readOrchestratorRecords } from '../adapters/OrchestratorRecordReader.ts';
import {
  type CapturedQuestion,
  type ConversationEntry,
  type SupervisorRequest,
  supervisorConversationOf,
  supervisorStateOf
} from '../adapters/SupervisorLineReader.ts';
import { processIsAlive } from '../lib/process-liveness/ProcessIsAlive.ts';
import type {
  ChatMessage,
  OrchestratorSession,
  PendingQuestion,
  ProductOwnerMode,
  QuestionContext,
  SessionAction,
  SessionRole
} from '../shared/DashboardContract.ts';
import { orchestratorFilePathsOf } from '../shared/OrchestratorFilePaths.ts';
import { UnknownValueUtil }        from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_LIMITS }        from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }      from '../shared/constants/DashboardProtocol.ts';

export interface OrchestratorSessionsOptions {
  /** Every session these sessions start, recover and address is of this role; another role's records are left alone. */
  role:                          SessionRole;
  /**
   * A launch past this many live sessions of the project is refused. Past one, each session's files are keyed by a
   * launch id of its own; at one, by the role and tracker alone, and a live record there refuses a launch too.
   */
  maximumLiveSessionsPerProject: number;
  orchestratorDirectory:         string;
  /** The Bun running the server and `agent-dashboard.ts`, which a supervisor is started with. */
  runtimeExecutablePath:         string;
  dashboardEntryPointPath:       string;
  startTimeoutMilliseconds:      number;
  reconnectMilliseconds:         number;
  /** The whole environment a supervisor starts with, its `HOME` and `AGENT_DASHBOARD_CLAUDE` among it. */
  supervisorEnvironment:         Record<string, string>;
}

export interface SessionLaunchDetails {
  /** The session a handoff took the board from, shown beside the fresh one. */
  previousSessionId: string | null;
  /** A product owner's start mode, kept in its record so a restarted server still shows it. */
  productOwnerMode:  ProductOwnerMode | null;
  /** A product owner's topic, kept in its record likewise; passed on only by a role whose sessions carry launch ids. */
  topic:             string | null;
}

export type OrchestratorLaunch =
  | { kind: 'started'; session: OrchestratorSession }
  | { kind: 'running' }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; reason: string };

export type SupervisorDelivery = { kind: 'delivered' } | { kind: 'none' } | { kind: 'failed'; reason: string };

export type AnswerDelivery = SupervisorDelivery | { kind: 'not-pending' } | { kind: 'mismatched'; reason: string };

export type SessionReply = { kind: 'replied'; text: string } | { kind: 'failed'; reason: string };

export type SessionEnd = { kind: 'ended' } | { kind: 'failed'; reason: string };

/**
 * A method's trailing `sessionId` addresses that session of the project; without one it addresses the project's default
 * session, the one `sessionOf(trackerId)` answers.
 */
export interface OrchestratorSessions {
  /**
   * Connects to every supervisor whose record lives and removes the records of those gone; `dispatcherRunIdOf` reads
   * the board's run when a question is first seen, for its context.
   */
  start(dispatcherRunIdOf: (trackerId: string) => string | null): void;
  /** The project's session of that id, else its first live one, else its newest ended one since this server started; else null. */
  sessionOf(trackerId: string, sessionId?: string): OrchestratorSession | null;
  /** Every session of the project since this server started, live first, then newest start first. */
  sessionsOf(trackerId: string): OrchestratorSession[];
  isLive(trackerId: string, sessionId?: string): boolean;
  launch(trackerId: string, root: string, firstMessage: string | null, launchDetails?: Partial<SessionLaunchDetails>): Promise<OrchestratorLaunch>;
  stop(trackerId: string, sessionId?: string): Promise<SupervisorDelivery>;
  /** Stops the session and resolves once it shows `ended`, or fails past the bound with the session left as it is. */
  stopAndAwaitEnd(trackerId: string, timeoutMilliseconds: number, sessionId?: string): Promise<SessionEnd>;
  /** Drops the session once it has ended, so `sessionOf` no longer answers it; a live session is left as it is. */
  forgetEnded(trackerId: string, sessionId?: string): void;
  chat(trackerId: string, text: string, sessionId?: string): Promise<SupervisorDelivery>;
  /**
   * Sends the text as a chat and resolves with the assistant text of the turn it opens, once the session is idle again;
   * fails when the session ends, asks a question instead, or gives no complete reply within the bound.
   */
  replyTo(trackerId: string, text: string, timeoutMilliseconds: number, sessionId?: string): Promise<SessionReply>;
  /**
   * Claims the pending question in the same turn it is checked, then sends the answers: a second answer arriving while
   * the first is in flight finds nothing pending. A delivery that is not made puts the question back.
   */
  answer(trackerId: string, requestId: string, answers: Record<string, string>, sessionId?: string): Promise<AnswerDelivery>;
  /** The session's conversation so far, oldest first, at most the supervisor's held history; empty for none. */
  conversationOf(trackerId: string, sessionId?: string): ChatMessage[];
  /** Called on every change of a session's state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /**
   * Called with each new chat message of the session, in order; without a `sessionId`, of whichever session is the
   * project's default when the message arrives. Returns the unsubscribe.
   */
  subscribeToConversation(trackerId: string, listener: (message: ChatMessage) => void, sessionId?: string): () => void;
  close(): void;
}

interface ConversationListener {
  sessionId: string | undefined;
  listener:  (message: ChatMessage) => void;
}

interface Supervised {
  trackerId:                  string;
  recordPath:                 string;
  socketPath:                 string;
  supervisorPid:              number;
  session:                    OrchestratorSession;
  connection:                 Socket | null;
  reconnectTimer:             ReturnType<typeof setTimeout> | null;
  /** Fixed on a question's first state line, so a later one or a reconnect never changes it. */
  questionContextByRequestId: Map<string, QuestionContext>;
}

function supervisedOf(recordPath: string, record: OrchestratorRecord, previousSessionId: string | null = null): Supervised {
  return {
    trackerId:                  record.trackerId,
    recordPath,
    socketPath:                 record.socketPath,
    supervisorPid:              record.supervisorPid,
    session:                    sessionFromRecord(record, previousSessionId),
    connection:                 null,
    reconnectTimer:             null,
    questionContextByRequestId: new Map(),
  };
}

const START_POLL_MILLISECONDS = 50;
const SESSION_LINE_MAXIMUM_CHARACTERS = 160;
const QUESTION_CONTEXT_ASSISTANT_MESSAGE_COUNT = 5;
/** The board's ticket id format: `#` and exactly three digits. */
const TICKET_MENTION_PATTERN = /#(\d{3})(?!\d)/gu;

function sessionLineOf(line: string): string {
  return line.trim().slice(0, SESSION_LINE_MAXIMUM_CHARACTERS);
}

function lastActionOf(message: ChatMessage): SessionAction | null {
  if (message.role === 'tool') return { at: message.at, text: message.text };
  if (message.role !== 'assistant') return null;
  return { at: message.at, text: sessionLineOf(message.text.trim().split('\n')[0] ?? '') };
}

function mentionedTicketIdsOf(texts: string[]): string[] {
  const ticketIds = texts.flatMap((text) => [...text.matchAll(TICKET_MENTION_PATTERN)].map((match) => match[1] ?? ''));
  return [...new Set(ticketIds)];
}

/** Mentions are read from the question texts first, then from the last five assistant messages oldest first. */
function questionContextOf(captured: CapturedQuestion, conversation: ChatMessage[], dispatcherRunId: string | null): QuestionContext {
  const assistantTexts = conversation.filter((message) => message.role === 'assistant').slice(-QUESTION_CONTEXT_ASSISTANT_MESSAGE_COUNT).map((message) => message.text);
  const lastAssistantLine = assistantTexts.at(-1)?.split('\n').findLast((line) => line.trim().length > 0);
  return {
    dispatcherRunId,
    mentionedTicketIds: mentionedTicketIdsOf([...captured.questions.map((question) => question.question), ...assistantTexts]),
    lastAssistantLine:  lastAssistantLine === undefined ? null : sessionLineOf(lastAssistantLine),
  };
}

/** Null when the answers name exactly the questions of the pending request, else why not. */
function answerMismatchOf(pending: PendingQuestion, answers: Record<string, string>): string | null {
  const askedQuestions = new Set(pending.questions.map((question) => question.question));
  const notAsked = Object.keys(answers).filter((question) => !askedQuestions.has(question));
  if (notAsked.length > 0) return `Not asked by this request: ${notAsked.join(', ')}`;
  const unanswered = [...askedQuestions].filter((question) => !Object.hasOwn(answers, question));
  return unanswered.length > 0 ? `Left unanswered: ${unanswered.join(', ')}` : null;
}

function sessionFromRecord(record: OrchestratorRecord, previousSessionId: string | null): OrchestratorSession {
  return {
    ownership:        'dashboard',
    sessionId:        record.sessionId,
    pid:              record.sessionPid,
    name:             null,
    state:            'starting',
    startedAt:        record.startedAt,
    context:          null,
    pendingQuestions: [],
    lastAction:       null,
    previousSessionId,
    productOwnerMode: record.role === 'product-owner' ? record.productOwnerMode : null,
    topic:            record.topic,
  };
}

function hasEnded(supervised: Supervised): boolean {
  return supervised.session.state === 'ended';
}

/**
 * The supervisor's arguments after the role: a product owner's mode, then, for a role whose sessions carry launch ids,
 * the launch id and any topic, each only after the one before it.
 */
function launchArgumentsOf(role: SessionRole, launchId: string | null, launchDetails: SessionLaunchDetails): string[] {
  const { productOwnerMode, topic } = launchDetails;
  if (role !== 'product-owner' || productOwnerMode === null) return [];
  if (launchId === null) return [productOwnerMode];
  return topic === null ? [productOwnerMode, launchId] : [productOwnerMode, launchId, topic];
}

export function createOrchestratorSessions(options: OrchestratorSessionsOptions): OrchestratorSessions {
  // Newest launch first, so of two sessions started in the same millisecond the later one sorts first.
  const supervisedByTracker = new Map<string, Supervised[]>();
  const listeners = new Set<() => void>();
  // Kept past `forgetEnded`, so a session's conversation stays readable by its id until the server stops.
  const conversationBySessionId = new Map<string, ConversationEntry[]>();
  const conversationListenersByTracker = new Map<string, Set<ConversationListener>>();
  const launchesInFlightByTracker = new Map<string, number>();
  const sessionsCarryLaunchIds = options.maximumLiveSessionsPerProject > 1;
  let dispatcherRunIdOf: (trackerId: string) => string | null = () => null;
  let closed = false;

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function projectSupervisedOf(trackerId: string): Supervised[] {
    return [...(supervisedByTracker.get(trackerId) ?? [])].sort((a, b) => Number(hasEnded(a)) - Number(hasEnded(b))
      || (b.session.startedAt ?? '').localeCompare(a.session.startedAt ?? ''));
  }

  function addressedOf(trackerId: string, sessionId: string | undefined): Supervised | undefined {
    const projectSupervised = projectSupervisedOf(trackerId);
    return sessionId === undefined ? projectSupervised[0] : projectSupervised.find((supervised) => supervised.session.sessionId === sessionId);
  }

  function supervise(supervised: Supervised): void {
    supervisedByTracker.set(supervised.trackerId, [supervised, ...(supervisedByTracker.get(supervised.trackerId) ?? [])]);
  }

  function conversationOf(trackerId: string, sessionId?: string): ChatMessage[] {
    const conversationSessionId = sessionId ?? addressedOf(trackerId, undefined)?.session.sessionId;
    if (conversationSessionId === undefined) return [];
    return (conversationBySessionId.get(conversationSessionId) ?? []).map((entry) => entry.message);
  }

  function tellConversationListeners(supervised: Supervised, message: ChatMessage): void {
    const { trackerId, session: { sessionId } } = supervised;
    const isDefaultSession = addressedOf(trackerId, undefined) === supervised;
    for (const registration of [...(conversationListenersByTracker.get(trackerId) ?? [])]) {
      if (registration.sessionId === sessionId || (registration.sessionId === undefined && isDefaultSession)) registration.listener(message);
    }
  }

  /**
   * A supervisor replays its history on every connect, so an entry already held is skipped by its sequence. The last
   * action changes without a notify: the supervisor sends a state line after every session line and every replay.
   */
  function takeConversationEntries(supervised: Supervised, entries: ConversationEntry[]): void {
    const { sessionId } = supervised.session;
    const conversation = conversationBySessionId.get(sessionId) ?? [];
    conversationBySessionId.set(sessionId, conversation);
    let latestHeldSequence = conversation.at(-1)?.sequence ?? 0;
    for (const entry of entries) {
      if (entry.sequence <= latestHeldSequence) continue;
      latestHeldSequence = entry.sequence;
      conversation.push(entry);
      if (conversation.length > DASHBOARD_LIMITS.CONVERSATION_HISTORY_MESSAGE_COUNT) conversation.shift();
      const lastAction = lastActionOf(entry.message);
      if (lastAction !== null) supervised.session = { ...supervised.session, lastAction };
      tellConversationListeners(supervised, entry.message);
    }
  }

  function pendingQuestionOf(supervised: Supervised, captured: CapturedQuestion): PendingQuestion {
    let context = supervised.questionContextByRequestId.get(captured.requestId);
    if (context === undefined) {
      const conversation = conversationOf(supervised.trackerId, supervised.session.sessionId);
      context = questionContextOf(captured, conversation, dispatcherRunIdOf(supervised.trackerId));
      supervised.questionContextByRequestId.set(captured.requestId, context);
    }
    return { ...captured, context };
  }

  function supervisorIsGone(supervised: Supervised): boolean {
    const reading = readOrchestratorRecord(supervised.recordPath);
    return reading.kind !== 'present' || reading.record.supervisorPid !== supervised.supervisorPid || !processIsAlive(supervised.supervisorPid);
  }

  /** Resolves true on the supervisor's first state line, false when the connection fails before it. */
  function connect(supervised: Supervised): Promise<boolean> {
    return new Promise((resolve) => {
      const connection = createConnection(supervised.socketPath);
      let unfinishedLine = '';
      let reported = false;
      connection.setEncoding('utf8');
      connection.on('data', (chunk: string) => {
        const lines = `${unfinishedLine}${chunk}`.split('\n');
        unfinishedLine = lines.pop() ?? '';
        for (const line of lines) {
          const conversation = supervisorConversationOf(line);
          if (conversation !== null) {
            const entries = conversation.kind === 'history' ? conversation.entries : [conversation.entry];
            takeConversationEntries(supervised, entries);
            continue;
          }
          const state = supervisorStateOf(line);
          if (state === null) continue;
          const pendingQuestions = state.pendingQuestions.map((captured) => pendingQuestionOf(supervised, captured));
          supervised.session = {
            ...supervised.session, state: state.state, context: state.context, pendingQuestions
          };
          if (!reported) {
            reported = true;
            supervised.connection = connection;
            resolve(true);
          }
          notify();
        }
      });
      connection.on('error', () => {});
      connection.on('close', () => {
        if (supervised.connection === connection) supervised.connection = null;
        if (!reported) resolve(false);
        if (closed || supervised.session.state === 'ended') return;
        if (supervisorIsGone(supervised)) {
          supervised.session = { ...supervised.session, state: 'ended', pendingQuestions: [] };
          notify();
          return;
        }
        supervised.reconnectTimer = setTimeout(() => {
          supervised.reconnectTimer = null;
          if (!closed) void connect(supervised);
        }, options.reconnectMilliseconds);
      });
    });
  }

  function start(boardDispatcherRunIdOf: (trackerId: string) => string | null): void {
    dispatcherRunIdOf = boardDispatcherRunIdOf;
    for (const reading of readOrchestratorRecords(options.orchestratorDirectory)) {
      if (reading.kind !== 'present' || reading.record.role !== options.role) continue;
      const { record } = reading;
      if (!processIsAlive(record.supervisorPid)) {
        rmSync(reading.recordPath, { force: true });
        rmSync(record.socketPath, { force: true });
        continue;
      }
      const supervised = supervisedOf(reading.recordPath, record);
      supervise(supervised);
      void connect(supervised);
    }
  }

  function isLive(trackerId: string, sessionId?: string): boolean {
    const supervised = addressedOf(trackerId, sessionId);
    return supervised !== undefined && !hasEnded(supervised);
  }

  function spawnSupervisor(trackerId: string, root: string, launchArguments: string[], logPath: string): { pid: number | undefined; exited: Promise<string> } {
    mkdirSync(options.orchestratorDirectory, { recursive: true });
    const logDescriptor = openSync(logPath, 'a');
    try {
      const superviseArguments = [options.dashboardEntryPointPath, DASHBOARD_PROTOCOL.SUPERVISE_COMMAND, trackerId, root, options.role, ...launchArguments];
      const supervisor = spawn(options.runtimeExecutablePath, superviseArguments, {
        cwd:      options.orchestratorDirectory,
        env:      options.supervisorEnvironment,
        detached: true,
        stdio:    ['ignore', logDescriptor, logDescriptor],
      });
      const exited = new Promise<string>((resolve) => {
        supervisor.once('error', (error) => resolve(UnknownValueUtil.errorMessageOf(error)));
        supervisor.once('exit', (exitCode, signal) => resolve(`the supervisor exited (${signal ?? `exit ${exitCode ?? 'unknown'}`}); its log is ${logPath}`));
      });
      supervisor.unref();
      return { pid: supervisor.pid, exited };
    } finally {
      closeSync(logDescriptor);
    }
  }

  /** Only a role of one session per project has a fixed record name, so only there can a live supervisor sit unconnected. */
  function sessionRunsUnconnected(trackerId: string): boolean {
    if (sessionsCarryLaunchIds) return false;
    const onDisk = readOrchestratorRecord(orchestratorFilePathsOf(options.orchestratorDirectory, trackerId, options.role).recordPath);
    return onDisk.kind === 'present' && processIsAlive(onDisk.record.supervisorPid);
  }

  async function launch(trackerId: string, root: string, firstMessage: string | null, launchDetails: Partial<SessionLaunchDetails> = {}): Promise<OrchestratorLaunch> {
    const launchesInFlight = launchesInFlightByTracker.get(trackerId) ?? 0;
    const liveSessionCount = projectSupervisedOf(trackerId).filter((supervised) => !hasEnded(supervised)).length;
    if (liveSessionCount + launchesInFlight >= options.maximumLiveSessionsPerProject || sessionRunsUnconnected(trackerId)) return { kind: 'running' };
    launchesInFlightByTracker.set(trackerId, launchesInFlight + 1);
    try {
      const launchId = sessionsCarryLaunchIds ? randomUUID() : null;
      return await launchSupervisor(trackerId, root, firstMessage, launchId, {
        previousSessionId: launchDetails.previousSessionId ?? null,
        productOwnerMode:  launchDetails.productOwnerMode ?? null,
        topic:             launchDetails.topic ?? null,
      });
    } finally {
      const remainingLaunches = (launchesInFlightByTracker.get(trackerId) ?? 1) - 1;
      if (remainingLaunches > 0) launchesInFlightByTracker.set(trackerId, remainingLaunches);
      else launchesInFlightByTracker.delete(trackerId);
    }
  }

  async function launchSupervisor(
    trackerId: string,
    root: string,
    firstMessage: string | null,
    launchId: string | null,
    launchDetails: SessionLaunchDetails,
  ): Promise<OrchestratorLaunch> {
    const paths = orchestratorFilePathsOf(options.orchestratorDirectory, trackerId, options.role, launchId);
    if (Buffer.byteLength(paths.socketPath) > DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES) {
      return { kind: 'refused', reason: `The socket path ${paths.socketPath} is longer than ${DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES} bytes` };
    }
    // The command line carries a launch id only after a product owner's mode, so without one the supervisor would key its files apart.
    if (launchId !== null && (options.role !== 'product-owner' || launchDetails.productOwnerMode === null)) {
      return { kind: 'refused', reason: 'A session with a launch id is a product owner started with a mode' };
    }
    const supervisor = spawnSupervisor(trackerId, root, launchArgumentsOf(options.role, launchId, launchDetails), paths.logPath);
    let exitReason: string | null = null;
    void supervisor.exited.then((reason) => { exitReason = reason; });
    const deadline = performance.now() + options.startTimeoutMilliseconds;
    while (performance.now() < deadline && exitReason === null) {
      const reading = readOrchestratorRecord(paths.recordPath);
      if (reading.kind === 'present' && reading.record.supervisorPid === supervisor.pid) {
        const supervised = supervisedOf(paths.recordPath, reading.record, launchDetails.previousSessionId);
        if (await connect(supervised)) {
          supervise(supervised);
          if (firstMessage !== null) await chat(trackerId, firstMessage, supervised.session.sessionId);
          notify();
          return { kind: 'started', session: supervised.session };
        }
      }
      await Bun.sleep(START_POLL_MILLISECONDS);
    }
    return { kind: 'failed', reason: exitReason ?? `The supervisor did not accept within ${options.startTimeoutMilliseconds} ms; its log is ${paths.logPath}` };
  }

  function send(supervised: Supervised | undefined, request: SupervisorRequest): Promise<SupervisorDelivery> {
    if (supervised === undefined || hasEnded(supervised)) return Promise.resolve({ kind: 'none' });
    const { connection } = supervised;
    if (connection === null) return Promise.resolve({ kind: 'failed', reason: 'The supervisor is not connected; the server retries' });
    return new Promise((resolve) => {
      connection.write(`${JSON.stringify(request)}\n`, (error) => {
        resolve(error === null || error === undefined ? { kind: 'delivered' } : { kind: 'failed', reason: `The supervisor socket failed: ${error.message}` });
      });
    });
  }

  function close(): void {
    closed = true;
    for (const supervised of [...supervisedByTracker.values()].flat()) {
      if (supervised.reconnectTimer !== null) clearTimeout(supervised.reconnectTimer);
      supervised.connection?.destroy();
    }
    listeners.clear();
    conversationListenersByTracker.clear();
  }

  function chat(trackerId: string, text: string, sessionId?: string): Promise<SupervisorDelivery> {
    const supervised = addressedOf(trackerId, sessionId);
    if (supervised?.session.state === 'stopping') return Promise.resolve({ kind: 'failed', reason: 'The session is stopping' });
    return send(supervised, { kind: 'chat', text });
  }

  /** A delivered Stop shows as stopping at once, its questions dropped, ahead of the supervisor's own state line saying so. */
  async function stop(trackerId: string, sessionId?: string): Promise<SupervisorDelivery> {
    const supervised = addressedOf(trackerId, sessionId);
    const delivery = await send(supervised, { kind: 'stop' });
    if (delivery.kind === 'delivered' && supervised !== undefined && !hasEnded(supervised)) {
      supervised.session = { ...supervised.session, state: 'stopping', pendingQuestions: [] };
      notify();
    }
    return delivery;
  }

  async function answer(trackerId: string, requestId: string, answers: Record<string, string>, sessionId?: string): Promise<AnswerDelivery> {
    const supervised = addressedOf(trackerId, sessionId);
    if (supervised === undefined || hasEnded(supervised)) return { kind: 'none' };
    const sessionBeforeAnswer = supervised.session;
    const pending = sessionBeforeAnswer.pendingQuestions.find((pendingQuestion) => pendingQuestion.requestId === requestId);
    if (pending === undefined) return { kind: 'not-pending' };
    const mismatch = answerMismatchOf(pending, answers);
    if (mismatch !== null) return { kind: 'mismatched', reason: mismatch };
    const claimedSession = { ...sessionBeforeAnswer, pendingQuestions: sessionBeforeAnswer.pendingQuestions.filter((pendingQuestion) => pendingQuestion !== pending) };
    supervised.session = claimedSession;
    notify();
    const delivery = await send(supervised, { kind: 'answer', requestId, answers });
    // A state line that arrived meanwhile is the supervisor's own word on what is pending, so only an untouched claim is undone.
    if (delivery.kind !== 'delivered' && supervised.session === claimedSession) {
      supervised.session = sessionBeforeAnswer;
      notify();
    }
    return delivery;
  }

  function subscribeToConversation(trackerId: string, listener: (message: ChatMessage) => void, sessionId?: string): () => void {
    const trackerListeners = conversationListenersByTracker.get(trackerId) ?? new Set();
    conversationListenersByTracker.set(trackerId, trackerListeners);
    const registration: ConversationListener = { sessionId, listener };
    trackerListeners.add(registration);
    return () => trackerListeners.delete(registration);
  }

  /** Settles once: on the first verdict `judge` gives on a state change, on `settle`, or as `timeoutVerdict` past the bound. */
  function awaitSessionVerdict<Verdict>(
    trackerId: string,
    sessionId: string | undefined,
    timeoutMilliseconds: number,
    timeoutVerdict: Verdict,
    judge: (session: OrchestratorSession | null) => Verdict | null,
  ): { verdict: Promise<Verdict>; settle: (verdict: Verdict) => void } {
    let settle: (verdict: Verdict) => void = () => {};
    const verdict = new Promise<Verdict>((resolve) => {
      let settled = false;

      function onChange(): void {
        const judged = judge(addressedOf(trackerId, sessionId)?.session ?? null);
        if (judged !== null) settle(judged);
      }
      const timer = setTimeout(() => settle(timeoutVerdict), timeoutMilliseconds);
      settle = (settledVerdict) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        listeners.delete(onChange);
        resolve(settledVerdict);
      };
      listeners.add(onChange);
    });
    return { verdict, settle };
  }

  /** The session addressed now, by its id, so the default moving to another session later never retargets the wait. */
  function pinnedSessionIdOf(trackerId: string, sessionId: string | undefined): string | undefined {
    return sessionId ?? addressedOf(trackerId, undefined)?.session.sessionId;
  }

  async function replyTo(trackerId: string, text: string, timeoutMilliseconds: number, sessionId?: string): Promise<SessionReply> {
    const pinnedSessionId = pinnedSessionIdOf(trackerId, sessionId);
    const replyTexts: string[] = [];
    const unsubscribeFromConversation = subscribeToConversation(trackerId, (message) => {
      if (message.role === 'assistant') replyTexts.push(message.text);
    }, pinnedSessionId);
    const { verdict, settle } = awaitSessionVerdict<SessionReply>(
      trackerId,
      pinnedSessionId,
      timeoutMilliseconds,
      { kind: 'failed', reason: `The session gave no complete reply within ${timeoutMilliseconds} ms` },
      (session) => {
        if (session === null || session.state === 'ended') return { kind: 'failed', reason: 'The session ended before it replied' };
        if (session.state === 'waiting-for-answer') return { kind: 'failed', reason: 'The session asked a question instead of replying' };
        return session.state === 'idle' && replyTexts.length > 0 ? { kind: 'replied', text: replyTexts.join('\n\n') } : null;
      },
    );
    const delivery = await chat(trackerId, text, pinnedSessionId);
    if (delivery.kind === 'none') settle({ kind: 'failed', reason: 'The session has ended' });
    if (delivery.kind === 'failed') settle(delivery);
    try {
      return await verdict;
    } finally {
      unsubscribeFromConversation();
    }
  }

  async function stopAndAwaitEnd(trackerId: string, timeoutMilliseconds: number, sessionId?: string): Promise<SessionEnd> {
    const pinnedSessionId = pinnedSessionIdOf(trackerId, sessionId);
    const { verdict, settle } = awaitSessionVerdict<SessionEnd>(
      trackerId,
      pinnedSessionId,
      timeoutMilliseconds,
      { kind: 'failed', reason: `The session did not end within ${timeoutMilliseconds} ms of Stop` },
      (session) => (session === null || session.state === 'ended' ? { kind: 'ended' } : null),
    );
    const delivery = await stop(trackerId, pinnedSessionId);
    if (delivery.kind === 'none') settle({ kind: 'ended' });
    if (delivery.kind === 'failed') settle(delivery);
    return verdict;
  }

  function forgetEnded(trackerId: string, sessionId?: string): void {
    const forgotten = addressedOf(trackerId, sessionId);
    if (forgotten === undefined || !hasEnded(forgotten)) return;
    supervisedByTracker.set(trackerId, (supervisedByTracker.get(trackerId) ?? []).filter((supervised) => supervised !== forgotten));
    notify();
  }

  return {
    start,
    sessionOf:  (trackerId, sessionId) => addressedOf(trackerId, sessionId)?.session ?? null,
    sessionsOf: (trackerId) => projectSupervisedOf(trackerId).map((supervised) => supervised.session),
    isLive,
    launch,
    stop,
    stopAndAwaitEnd,
    forgetEnded,
    chat,
    replyTo,
    answer,
    conversationOf,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeToConversation,
    close,
  };
}
