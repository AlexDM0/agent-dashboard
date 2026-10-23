/**
 * The dashboard's HTTP servers, bound to 127.0.0.1 only. The dashboard origin: the React app, the server identity, the
 * snapshot and its event stream, a project's concurrency limit set and its dispatcher stopped through its agent-progress
 * CLI, a message to a board's orchestrator Claude Code session, a dashboard-owned orchestrator's start, stop, chat,
 * answers and conversation stream, a shutdown the CLI's `stop` asks for and a restart the page's menu asks for. The board
 * origin, a port of its own: each project's page folder and the bridge page, so no board page is same-origin with the
 * dashboard. Every route but the app shell refuses a request whose Host is not its server's own, against DNS rebinding;
 * Bun answers the shell before `fetch`, and it holds no data.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { join, normalize }             from 'node:path';

import dashboardApplication from '../../web/index.html';

import { readBoardStatus }                                                from '../adapters/BoardStatusReader.ts';
import { writeConcurrencyLimit }                                          from '../adapters/ConcurrencyLimitWriter.ts';
import { writeDispatcherStopped }                                         from '../adapters/DispatcherStopWriter.ts';
import { type LiveSession, findOrchestratorSession, findWatchedSessions } from '../adapters/OrchestratorSessionFinder.ts';
import { sessionSocketAccepts, writeSessionMessage }                      from '../adapters/SessionMessageWriter.ts';
import { readTranscriptUsage }                                            from '../adapters/TranscriptUsageReader.ts';
import { resolveContainedPath }                                           from '../lib/contained-path/ContainedPath.ts';
import {
  type BoardSummary,
  type DashboardSnapshot,
  type LaunchToken,
  type OrchestratorAnswerRequest,
  type OrchestratorChatRequest,
  type OrchestratorHandoffResult,
  type OrchestratorRecipient,
  type OrchestratorRequestReceipt,
  type OrchestratorSession,
  type ProjectSnapshot,
  type ServerIdentity
} from '../shared/DashboardContract.ts';
import { environmentCopy }                                                                     from '../shared/Environment.ts';
import { orchestratorDirectoryOf }                                                             from '../shared/OrchestratorFilePaths.ts';
import { UnknownValueUtil }                                                                    from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }                                                                     from '../shared/constants/DashboardFiles.ts';
import { DASHBOARD_LIMITS }                                                                    from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                                                                  from '../shared/constants/DashboardProtocol.ts';
import { handOffOrchestrator, handoffDirectoryOf }                                             from './OrchestratorHandoff.ts';
import { ORCHESTRATOR_REQUEST_BODY_REFUSAL, orchestratorMessageTextOf, orchestratorRequestOf } from './OrchestratorRequestMessage.ts';
import { type OrchestratorSessions, createOrchestratorSessions }                               from './OrchestratorSessions.ts';
import { type MonitoredSnapshot, type ProjectMonitor, createProjectMonitor }                   from './ProjectMonitor.ts';

export interface DashboardServerOptions {
  port:                      number;
  homeDirectory:             string;
  agentProgressExecutable:   string | null;
  /** The Bun running the server, which runs a Bun-script agent-progress itself. */
  runtimeExecutablePath:     string;
  /** `agent-dashboard.ts`, which the server runs a detached orchestrator supervisor with. */
  dashboardEntryPointPath:   string;
  /** The Claude Code executable an orchestrator session runs; null refuses every start. */
  claudeExecutable:          string | null;
  version:                   string;
  clock:                     () => Date;
  /** Read by the CLI, since only `cli/CommandContext.ts` reads the machine. */
  machineParallelAgentLimit: number;
}

export interface RunningDashboardServer {
  url:         string;
  port:        number;
  boardOrigin: string;
  boardPort:   number;
  stop():      Promise<void>;
  stopped:     Promise<void>;
  /** Whether the stop was a restart the page asked for, so `serve` starts a successor once the ports are free. */
  isRestartRequested(): boolean;
}

/** Which of the two ports a start found held. */
export type ServerPortRole = 'dashboard' | 'board';

export type DashboardServerStart =
  | { kind: 'started'; server: RunningDashboardServer }
  | { kind: 'port-in-use'; port: number; role: ServerPortRole };

const LOOPBACK_ADDRESS = '127.0.0.1';

const LOOPBACK_HOST_NAMES = [LOOPBACK_ADDRESS, 'localhost', '[::1]'] as const;

/** A browser leaves this port out of the Host header it sends. */
const HTTP_DEFAULT_PORT = 80;

/** A port the system picks, which a spec asks for; the board then takes one the system picks too. */
const SYSTEM_CHOSEN_PORT = 0;

/**
 * `progress.html` is self-contained, inline scripts and styles, polling its stamp beside it; it may reach nothing but
 * the board origin and be framed by nothing but the dashboard.
 */
function boardPagePolicyOf(dashboardSources: string): string {
  return [
    'default-src \'self\'',
    'script-src \'self\' \'unsafe-inline\'',
    'style-src \'self\' \'unsafe-inline\'',
    'img-src \'self\' data:',
    'font-src \'self\' data:',
    'connect-src \'self\'',
    'object-src \'none\'',
    'base-uri \'none\'',
    'form-action \'none\'',
    `frame-ancestors ${dashboardSources}`,
  ].join('; ');
}

/** The bridge runs its one script from the board origin, holds no frame of its own, and only the dashboard frames it. */
function bridgePagePolicyOf(dashboardSources: string): string {
  return ['default-src \'none\'', 'script-src \'self\'', 'base-uri \'none\'', 'form-action \'none\'', `frame-ancestors ${dashboardSources}`].join('; ');
}

/** Any other file in the folder (a ticket, a brief, something a repository brought) opens in an origin of its own with no script. */
const SANDBOXED_FILE_POLICY = 'sandbox';

const BRIDGE_ENTRY_POINT = join(import.meta.dir, '..', '..', 'web', 'bridge', 'BoardBridgeMain.ts');

/** Bun bundles the manifest from `web/index.html` under a hashed name, but not the icons it names, so they get fixed paths. */
const INSTALL_ICON_FILE_NAMES = ['AppIcon192.png', 'AppIcon512.png'];

function installIconRoutes(): Record<string, Bun.BunFile> {
  return Object.fromEntries(INSTALL_ICON_FILE_NAMES.map((fileName) => [`/${fileName}`, Bun.file(join(import.meta.dir, '..', '..', 'web', fileName))]));
}

/** The bridge script is its own small bundle, built on its first request rather than at load. */
async function builtBridgeScript(): Promise<string> {
  const build = await Bun.build({ entrypoints: [BRIDGE_ENTRY_POINT], target: 'browser', minify: true });
  const [script] = build.outputs;
  if (!build.success || script === undefined) throw new Error('the bridge script did not build');
  return script.text();
}

/** The data attribute carries every name the dashboard may be reached by, so the bridge knows whom to answer. */
function bridgePageOf(dashboardOrigins: readonly string[]): string {
  return [
    '<!doctype html>',
    `<html lang="en" data-dashboard-origins="${dashboardOrigins.join(' ')}">`,
    '<head><meta charset="utf-8"><title>agent-dashboard board bridge</title></head>',
    `<body><script src="${DASHBOARD_PROTOCOL.BOARD_BRIDGE_SCRIPT_PATH}"></script></body>`,
    '</html>',
    '',
  ].join('\n');
}

export function boardPortOf(dashboardPort: number): number {
  return dashboardPort === SYSTEM_CHOSEN_PORT ? SYSTEM_CHOSEN_PORT : dashboardPort + DASHBOARD_PROTOCOL.BOARD_PORT_OFFSET;
}

const PAGE_ROUTE_PATTERN = /^\/projects\/([^/]+)\/page\/(.+)$/;

const CONCURRENCY_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.CONCURRENCY_PATH_SUFFIX}$`);

const DISPATCHER_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.DISPATCHER_PATH_SUFFIX}$`);

const ORCHESTRATOR_REQUESTS_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_REQUESTS_PATH_SUFFIX}$`);

const ORCHESTRATOR_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_PATH_SUFFIX}$`);

const ORCHESTRATOR_MESSAGES_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_MESSAGES_PATH_SUFFIX}$`);

const ORCHESTRATOR_ANSWERS_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_ANSWERS_PATH_SUFFIX}$`);

const ORCHESTRATOR_EVENTS_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_EVENTS_PATH_SUFFIX}$`);

const ORCHESTRATOR_HANDOFF_ROUTE_PATTERN = new RegExp(`^${DASHBOARD_PROTOCOL.PROJECTS_API_PATH}/([^/]+)${DASHBOARD_PROTOCOL.ORCHESTRATOR_HANDOFF_PATH_SUFFIX}$`);

const HTTP_STATUS = {
  CREATED:               201,
  NO_CONTENT:            204,
  BAD_REQUEST:           400,
  FORBIDDEN:             403,
  NOT_FOUND:             404,
  METHOD_NOT_ALLOWED:    405,
  CONFLICT:              409,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY:           502,
} as const;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

/** Each loopback name with the port; on the default HTTP port also bare, as a browser sends it there. */
export function allowedHostHeadersOf(port: number): Set<string> {
  const withPort = LOOPBACK_HOST_NAMES.map((hostName) => `${hostName}:${port}`);
  return new Set(port === HTTP_DEFAULT_PORT ? [...withPort, ...LOOPBACK_HOST_NAMES] : withPort);
}

/** Asked of a path already contained in the page folder, so its normal form is relative to it. */
function contentSecurityPolicyOf(containedRequestedPath: string, boardPagePolicy: string): string {
  const relativePath = normalize(containedRequestedPath);
  return relativePath === DASHBOARD_FILES.PAGE_FILE_NAME || relativePath === DASHBOARD_FILES.STAMP_FILE_NAME ? boardPagePolicy : SANDBOXED_FILE_POLICY;
}

function plainResponse(status: number, text: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE_HEADERS, ...extraHeaders } });
}

function methodNotAllowed(allowedMethods: string): Response {
  return plainResponse(HTTP_STATUS.METHOD_NOT_ALLOWED, 'Method not allowed', { Allow: allowedMethods });
}

function decodedOrNull(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

const CONCURRENCY_BODY_REFUSAL = 'The body must be { "limit": <n> }, a whole number '
  + `from ${DASHBOARD_LIMITS.MINIMUM_CONCURRENCY_LIMIT} to ${DASHBOARD_LIMITS.MAXIMUM_CONCURRENCY_LIMIT}`;

/** The limit a `{ "limit": <n> }` body asks for, or null when it is not JSON or not a whole number within the CLI's bounds. */
function requestedConcurrencyLimitOf(bodyText: string): number | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || !Object.hasOwn(body, 'limit')) return null;
  const { limit } = body as Record<string, unknown>;
  if (typeof limit !== 'number' || !Number.isInteger(limit)) return null;
  return limit >= DASHBOARD_LIMITS.MINIMUM_CONCURRENCY_LIMIT && limit <= DASHBOARD_LIMITS.MAXIMUM_CONCURRENCY_LIMIT ? limit : null;
}

const DISPATCHER_BODY_REFUSAL = 'The body must be { "state": "stopped" }';

/** Stopping is the one dispatcher change a click may make, so the body is that one object and nothing else. */
function isDispatcherStopBody(bodyText: string): boolean {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return false;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] === 'state' && (body as Record<string, unknown>)['state'] === 'stopped';
}

const ORCHESTRATOR_START_BODY_REFUSAL = 'The body must be { "startBuilding": <boolean> }';

/** Starting is all the body may ask, so it is that one key and nothing else. */
function requestedStartBuildingOf(bodyText: string): boolean | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!UnknownValueUtil.isJsonObject(body)) return null;
  const keys = Object.keys(body);
  const { startBuilding } = body;
  return keys.length === 1 && keys[0] === 'startBuilding' && typeof startBuilding === 'boolean' ? startBuilding : null;
}

const ORCHESTRATOR_CHAT_BODY_REFUSAL
  = `The body must be { "text": <string> } or { "text": <string>, "sessionId": <string> }, the text 1 to ${DASHBOARD_LIMITS.MAXIMUM_CHAT_TEXT_CHARACTERS} characters trimmed`;

function parsedJsonObjectOrNull(bodyText: string): Record<string, unknown> | null {
  try {
    const body: unknown = JSON.parse(bodyText);
    return UnknownValueUtil.isJsonObject(body) ? body : null;
  } catch {
    return null;
  }
}

/** The request with its text trimmed, or null for any body but `{ "text" }` or `{ "text", "sessionId" }`. */
function requestedChatOf(bodyText: string): OrchestratorChatRequest | null {
  const body = parsedJsonObjectOrNull(bodyText);
  if (body === null || typeof body['text'] !== 'string') return null;
  const keys = Object.keys(body).sort().join();
  if (keys !== 'text' && keys !== 'sessionId,text') return null;
  const text = body['text'].trim();
  if (text.length === 0 || text.length > DASHBOARD_LIMITS.MAXIMUM_CHAT_TEXT_CHARACTERS) return null;
  const { sessionId } = body;
  if (sessionId === undefined) return { text };
  return typeof sessionId === 'string' && sessionId.length > 0 ? { text, sessionId } : null;
}

const ORCHESTRATOR_ANSWER_BODY_REFUSAL = 'The body must be { "requestId": <string>, "answers": { "<question>": "<answer>" } }, every answer non-empty';

function requestedAnswerOf(bodyText: string): OrchestratorAnswerRequest | null {
  const body = parsedJsonObjectOrNull(bodyText);
  if (body === null || Object.keys(body).sort().join() !== 'answers,requestId') return null;
  const { requestId, answers } = body;
  if (typeof requestId !== 'string' || requestId.length === 0 || !UnknownValueUtil.isJsonObject(answers)) return null;
  const answerEntries = Object.entries(answers);
  const everyAnswerIsText = answerEntries.every((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0);
  return everyAnswerIsText && answerEntries.length > 0 ? { requestId, answers: Object.fromEntries(answerEntries) } : null;
}

function serverSentEventOf(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A project whose board cannot be read has no dispatcher run, so it watches no session. */
function dispatcherRunIdOf(project: Pick<ProjectSnapshot, 'health'> | undefined): string | null {
  return project?.health.kind === 'ready' ? project.health.board.dispatcherRunId : null;
}

/**
 * Every live session holding the project's dispatcher run that the dashboard did not start, matched against the
 * dashboard-owned ones by pid and session id.
 */
function watchedSessionsOf(homeDirectory: string, project: Pick<ProjectSnapshot, 'health'> | undefined, dashboardOwnedSessions: OrchestratorSession[]): LiveSession[] {
  const ownedPids = new Set(dashboardOwnedSessions.map((session) => session.pid));
  const ownedSessionIds = new Set(dashboardOwnedSessions.map((session) => session.sessionId));
  return findWatchedSessions({
    homeDirectory,
    dispatcherRunId:  dispatcherRunIdOf(project),
    isDashboardOwned: (session) => ownedPids.has(session.pid) || ownedSessionIds.has(session.sessionId),
  });
}

/** A transcript carries no context window, so a watched session borrows the one a dashboard-owned session reported for its model. */
function watchedOrchestratorOf(homeDirectory: string, session: LiveSession, contextWindowByModel: ReadonlyMap<string, number>): OrchestratorSession {
  const reading = readTranscriptUsage({ homeDirectory, cwd: session.cwd, sessionId: session.sessionId }, DASHBOARD_LIMITS.TRANSCRIPT_TAIL_BYTES);
  const context = reading.kind === 'measured' ? { ...reading.usage, contextWindowTokens: contextWindowByModel.get(reading.usage.model) ?? null } : null;
  return {
    ownership:         'watched',
    sessionId:         session.sessionId,
    pid:               session.pid,
    name:              session.name,
    state:             session.status === 'busy' ? 'busy' : 'idle',
    startedAt:         session.startedAt,
    context,
    pendingQuestions:  [],
    lastAction:        null,
    previousSessionId: null,
  };
}

function contextWindowsByModelOf(dashboardOwnedSessions: OrchestratorSession[]): Map<string, number> {
  const contextWindowByModel = new Map<string, number>();
  for (const { context } of dashboardOwnedSessions) {
    if (context !== null && context.contextWindowTokens !== null) contextWindowByModel.set(context.model, context.contextWindowTokens);
  }
  return contextWindowByModel;
}

interface RegisteredProjectRequest {
  trackerId: string;
  root:      string;
  bodyText:  string;
}

type OrchestratorDelivery = { kind: 'delivered'; recipient: OrchestratorRecipient } | { kind: 'refused'; response: Response };

interface OrchestratorSources {
  homeDirectory:  string;
  orchestratorOf: (trackerId: string) => OrchestratorSession | null;
}

/**
 * The monitor's snapshot with every page addressed on the board origin, each project's dashboard-owned orchestrator,
 * and the sessions holding each project's dispatcher run, read afresh from `~/.claude/` for every snapshot served.
 */
function servedSnapshotOf(monitored: MonitoredSnapshot, boardOrigin: string, orchestratorSources: OrchestratorSources): DashboardSnapshot {
  const { homeDirectory, orchestratorOf } = orchestratorSources;
  const dashboardOwnedByTracker = new Map(monitored.projects.map((project) => [project.trackerId, orchestratorOf(project.trackerId)]));
  const dashboardOwnedSessions = [...dashboardOwnedByTracker.values()].filter((session): session is OrchestratorSession => session !== null);
  const contextWindowByModel = contextWindowsByModelOf(dashboardOwnedSessions);
  return {
    ...monitored,
    projects: monitored.projects.map((project) => ({
      ...project,
      pageUrl:      `${boardOrigin}${project.pageUrl}`,
      orchestrator: dashboardOwnedByTracker.get(project.trackerId) ?? null,
    })),
    boardOrigin,
    boardBridgeUrl:                `${boardOrigin}${DASHBOARD_PROTOCOL.BOARD_BRIDGE_PATH}`,
    watchedOrchestratorsByTracker: Object.fromEntries(monitored.projects.map((project) => [
      project.trackerId,
      watchedSessionsOf(homeDirectory, project, dashboardOwnedSessions).map((session) => watchedOrchestratorOf(homeDirectory, session, contextWindowByModel)),
    ])),
  };
}

function snapshotEvent(snapshot: DashboardSnapshot): string {
  return serverSentEventOf('snapshot', snapshot);
}

interface ServingDependencies {
  monitor:                         ProjectMonitor;
  orchestratorSessions:            OrchestratorSessions;
  heartbeatIntervalMilliseconds:   number;
  /** How long a handoff waits for the running session's note; a spec passes a short one. */
  handoffReplyTimeoutMilliseconds: number;
}

export function createDashboardOrchestratorSessions(options: DashboardServerOptions, supervisorEnvironment = environmentCopy()): OrchestratorSessions {
  return createOrchestratorSessions({
    orchestratorDirectory:    orchestratorDirectoryOf(options.homeDirectory),
    runtimeExecutablePath:    options.runtimeExecutablePath,
    dashboardEntryPointPath:  options.dashboardEntryPointPath,
    startTimeoutMilliseconds: DASHBOARD_LIMITS.SUPERVISOR_START_TIMEOUT_MILLISECONDS,
    reconnectMilliseconds:    DASHBOARD_LIMITS.SUPERVISOR_RECONNECT_MILLISECONDS,
    supervisorEnvironment,
  });
}

/** The server with its monitor given; `startDashboardServer` builds the real monitor, a spec may pass its own. */
export async function serveDashboard(options: DashboardServerOptions, dependencies: ServingDependencies): Promise<DashboardServerStart> {
  const { monitor, orchestratorSessions } = dependencies;
  // Held in memory only: never in the app shell, the log, the server record or a tracked repository.
  const launchToken = randomUUID();
  const closeOpenStreams = new Set<() => void>();
  const trackersBeingHandedOff = new Set<string>();
  let stopping: Promise<void> | null = null;
  let restartIsRequested = false;
  let resolveStopped = (): void => {};
  const stopped = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });

  let server: Bun.Server<undefined>;
  try {
    server = Bun.serve({
      hostname:    LOOPBACK_ADDRESS,
      port:        options.port,
      development: false,
      // Bun turns SO_REUSEPORT on without development mode, which would let a second dashboard share the port.
      reusePort:   false,
      routes:      { '/': dashboardApplication, ...installIconRoutes() },
      fetch:       (request, servingServer) => answer(request, servingServer),
    });
  } catch (error) {
    if (UnknownValueUtil.errorCodeOf(error) === 'EADDRINUSE') return { kind: 'port-in-use', port: options.port, role: 'dashboard' };
    throw error;
  }

  const port = server.port ?? options.port;
  const url = `http://${LOOPBACK_ADDRESS}:${port}`;
  const allowedHosts = allowedHostHeadersOf(port);
  const ownOrigins = new Set([...allowedHosts].map((host) => `http://${host}`));
  // CSP host sources take no bracketed IPv6 literal, and the server listens on 127.0.0.1 alone anyway.
  const dashboardOrigins = [...ownOrigins].filter((origin) => !origin.includes('['));
  const dashboardSources = dashboardOrigins.join(' ');

  let boardServer: Bun.Server<undefined>;
  try {
    boardServer = Bun.serve({
      hostname:    LOOPBACK_ADDRESS,
      port:        boardPortOf(options.port),
      development: false,
      reusePort:   false,
      fetch:       (request) => answerOnBoardOrigin(request),
    });
  } catch (error) {
    await server.stop(true);
    if (UnknownValueUtil.errorCodeOf(error) === 'EADDRINUSE') return { kind: 'port-in-use', port: boardPortOf(options.port), role: 'board' };
    throw error;
  }

  const boardPort = boardServer.port ?? boardPortOf(options.port);
  const boardOrigin = `http://${LOOPBACK_ADDRESS}:${boardPort}`;
  const boardAllowedHosts = allowedHostHeadersOf(boardPort);
  const boardPagePolicy = boardPagePolicyOf(dashboardSources);
  let bridgeScript: Promise<string> | null = null;
  const monitorStarted = monitor.start();
  orchestratorSessions.start((trackerId) => dispatcherRunIdOf(monitor.snapshot().projects.find((project) => project.trackerId === trackerId)));

  const orchestratorSources: OrchestratorSources = { homeDirectory: options.homeDirectory, orchestratorOf: orchestratorSessions.sessionOf };

  function servedSnapshot(): DashboardSnapshot {
    return servedSnapshotOf(monitor.snapshot(), boardOrigin, orchestratorSources);
  }

  function stop(): Promise<void> {
    stopping ??= (async () => {
      for (const closeStream of [...closeOpenStreams]) closeStream();
      orchestratorSessions.close();
      await monitor.stop();
      await boardServer.stop(true);
      await server.stop(true);
      resolveStopped();
    })();
    return stopping;
  }

  function identityResponse(): Response {
    const identity: ServerIdentity = { application: 'agent-dashboard', version: options.version, pid: process.pid };
    return Response.json(identity, { headers: NO_STORE_HEADERS });
  }

  /** `startEvents` subscribes, sends what a new client sees first, and returns the unsubscribe. */
  function serverSentEventsResponse(request: Request, servingServer: Bun.Server<undefined>, startEvents: (send: (text: string) => void) => () => void): Response {
    servingServer.timeout(request, 0);
    const encoder = new TextEncoder();
    let releaseStream = (): void => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        function send(text: string): void {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            releaseStream();
          }
        }
        const heartbeat = setInterval(() => send(': heartbeat\n\n'), dependencies.heartbeatIntervalMilliseconds);

        function closeStream(): void {
          releaseStream();
          try {
            controller.close();
          } catch {
            // The client may already have gone, which closed it.
          }
        }
        let released = false;
        let unsubscribe = (): void => {};
        releaseStream = () => {
          if (released) return;
          released = true;
          unsubscribe();
          clearInterval(heartbeat);
          closeOpenStreams.delete(closeStream);
        };
        closeOpenStreams.add(closeStream);
        request.signal.addEventListener('abort', () => releaseStream());
        unsubscribe = startEvents(send);
        if (released) unsubscribe();
      },
      cancel() {
        releaseStream();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive', ...NO_STORE_HEADERS }, });
  }

  function snapshotEventsResponse(request: Request, servingServer: Bun.Server<undefined>): Response {
    return serverSentEventsResponse(request, servingServer, (send) => {
      const unsubscribeFromMonitor = monitor.subscribe((snapshot) => send(snapshotEvent(servedSnapshotOf(snapshot, boardOrigin, orchestratorSources))));
      const unsubscribeFromOrchestrators = orchestratorSessions.subscribe(() => send(snapshotEvent(servedSnapshot())));
      send(snapshotEvent(servedSnapshot()));
      return () => {
        unsubscribeFromMonitor();
        unsubscribeFromOrchestrators();
      };
    });
  }

  /** The conversation from the session's start, then each new message, and the session on every change of it. */
  async function orchestratorEventsResponse(request: Request, servingServer: Bun.Server<undefined>, encodedTrackerId: string): Promise<Response> {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    if (trackerId === null || monitor.rootOf(trackerId) === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    return serverSentEventsResponse(request, servingServer, (send) => {
      let lastSentSessionText = JSON.stringify(orchestratorSessions.sessionOf(trackerId));
      const unsubscribeFromConversation = orchestratorSessions.subscribeToConversation(trackerId, (message) => send(serverSentEventOf('message', message)));
      const unsubscribeFromSessions = orchestratorSessions.subscribe(() => {
        const sessionText = JSON.stringify(orchestratorSessions.sessionOf(trackerId));
        if (sessionText === lastSentSessionText) return;
        lastSentSessionText = sessionText;
        send(`event: session\ndata: ${sessionText}\n\n`);
      });
      send(serverSentEventOf('history', orchestratorSessions.conversationOf(trackerId)));
      send(`event: session\ndata: ${lastSentSessionText}\n\n`);
      return () => {
        unsubscribeFromConversation();
        unsubscribeFromSessions();
      };
    });
  }

  function shutdownResponse(request: Request): Response {
    const origin = request.headers.get('Origin');
    const shutdownHeader = request.headers.get(DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_NAME);
    if (shutdownHeader !== DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_VALUE || (origin !== null && !ownOrigins.has(origin))) {
      return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    }
    // The answer leaves before the server closes its connections.
    setTimeout(() => void stop(), 0);
    return plainResponse(DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS, 'Stopping');
  }

  function restartResponse(request: Request): Response {
    const restartHeader = request.headers.get(DASHBOARD_PROTOCOL.RESTART_HEADER_NAME);
    if (restartHeader !== DASHBOARD_PROTOCOL.RESTART_HEADER_VALUE || isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    restartIsRequested = true;
    setTimeout(() => void stop(), 0);
    return plainResponse(DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS, 'Restarting');
  }

  function isForeignOrigin(request: Request): boolean {
    const origin = request.headers.get('Origin');
    return origin !== null && !ownOrigins.has(origin);
  }

  /** The root is looked up only once the body is read, so a project unregistered during that read is a 404, never acted on. */
  async function registeredProjectRequestOf(request: Request, encodedTrackerId: string): Promise<RegisteredProjectRequest | null> {
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    if (trackerId === null) return null;
    const bodyText = await request.text().catch(() => '');
    const root = monitor.rootOf(trackerId);
    return root === null ? null : { trackerId, root, bodyText };
  }

  async function concurrencyLimitResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, root, bodyText } = projectRequest;
    const limit = requestedConcurrencyLimitOf(bodyText);
    if (limit === null) return plainResponse(HTTP_STATUS.BAD_REQUEST, CONCURRENCY_BODY_REFUSAL);
    const verdict = await writeConcurrencyLimit({
      executable:          options.agentProgressExecutable,
      runtimeExecutable:   options.runtimeExecutablePath,
      root,
      limit,
      timeoutMilliseconds: DASHBOARD_LIMITS.CONCURRENCY_WRITE_TIMEOUT_MILLISECONDS,
    });
    if (verdict.kind === 'refused') return plainResponse(HTTP_STATUS.CONFLICT, verdict.reason);
    if (verdict.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, verdict.reason);
    await monitor.refreshProjectNow(trackerId);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  async function dispatcherStopResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, root, bodyText } = projectRequest;
    if (!isDispatcherStopBody(bodyText)) return plainResponse(HTTP_STATUS.BAD_REQUEST, DISPATCHER_BODY_REFUSAL);
    const verdict = await writeDispatcherStopped({
      executable:          options.agentProgressExecutable,
      runtimeExecutable:   options.runtimeExecutablePath,
      root,
      timeoutMilliseconds: DASHBOARD_LIMITS.DISPATCHER_STOP_TIMEOUT_MILLISECONDS,
    });
    if (verdict.kind === 'refused') return plainResponse(HTTP_STATUS.CONFLICT, verdict.reason);
    if (verdict.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, verdict.reason);
    await monitor.refreshProjectNow(trackerId);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  /** Writes nothing to the board or the repository: the message to the orchestrator session is the whole effect. */
  async function orchestratorRequestResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, root, bodyText } = projectRequest;
    const orchestratorRequest = orchestratorRequestOf(bodyText);
    if (orchestratorRequest === null) return plainResponse(HTTP_STATUS.BAD_REQUEST, ORCHESTRATOR_REQUEST_BODY_REFUSAL);

    const project = monitor.snapshot().projects.find((projectSnapshot) => projectSnapshot.trackerId === trackerId);
    const board = project?.health.kind === 'ready' ? project.health.board : null;
    if (orchestratorRequest.kind === 'clear-low-tickets') {
      if (board === null) return plainResponse(HTTP_STATUS.CONFLICT, 'The board cannot be read, so its low-priority tickets cannot be checked');
      const waitingTicketIds = new Set(board.lowPriorityWaitingTickets.map((ticket) => ticket.ticketId));
      const unknownTicketIds = orchestratorRequest.ticketIds.filter((ticketId) => !waitingTicketIds.has(ticketId));
      if (unknownTicketIds.length > 0) {
        return plainResponse(HTTP_STATUS.CONFLICT, `Not low-priority waiting tickets on this board: ${unknownTicketIds.join(', ')}`);
      }
    }

    const projectName = project?.project ?? trackerId;
    const delivery = await orchestratorDeliveryOf(trackerId, root, board, (recipient) => orchestratorMessageTextOf(orchestratorRequest, projectName, recipient));
    if (delivery.kind === 'refused') return delivery.response;
    const receipt: OrchestratorRequestReceipt = { recipient: delivery.recipient };
    return Response.json(receipt, { headers: NO_STORE_HEADERS });
  }

  /** A live dashboard-owned session takes the text as its user's turn; else the one watched session the finder names, as a peer's. */
  async function orchestratorDeliveryOf(
    trackerId: string,
    root: string,
    board: BoardSummary | null,
    messageTextOf: (recipient: OrchestratorRecipient) => string
  ): Promise<OrchestratorDelivery> {
    if (orchestratorSessions.isLive(trackerId)) {
      const delivery = await orchestratorSessions.chat(trackerId, messageTextOf('dashboard-session'));
      if (delivery.kind === 'failed') return { kind: 'refused', response: plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason) };
      if (delivery.kind === 'delivered') return { kind: 'delivered', recipient: 'dashboard-session' };
    }

    const search = await findOrchestratorSession({
      homeDirectory:   options.homeDirectory,
      projectRoot:     root,
      dispatcherRunId: board?.dispatcherRunId ?? null,
      socketAccepts:   (socketPath) => sessionSocketAccepts(socketPath, DASHBOARD_LIMITS.SESSION_SOCKET_TIMEOUT_MILLISECONDS),
    });
    if (search.kind === 'refused') return { kind: 'refused', response: plainResponse(HTTP_STATUS.CONFLICT, search.reason) };
    const delivery = await writeSessionMessage(
      search.session.messagingSocketPath,
      messageTextOf('desktop-session'),
      DASHBOARD_LIMITS.SESSION_SOCKET_TIMEOUT_MILLISECONDS
    );
    if (delivery.kind === 'failed') return { kind: 'refused', response: plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason) };
    return { kind: 'delivered', recipient: 'desktop-session' };
  }

  async function orchestratorChatResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (!carriesLaunchGrant(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, root, bodyText } = projectRequest;
    const chat = requestedChatOf(bodyText);
    if (chat === null) return plainResponse(HTTP_STATUS.BAD_REQUEST, ORCHESTRATOR_CHAT_BODY_REFUSAL);
    if (chat.sessionId !== undefined) return deliveredToNamedSessionResponse(trackerId, chat.sessionId, chat.text);
    const project = monitor.snapshot().projects.find((projectSnapshot) => projectSnapshot.trackerId === trackerId);
    const delivery = await orchestratorDeliveryOf(trackerId, root, project?.health.kind === 'ready' ? project.health.board : null, () => chat.text);
    if (delivery.kind === 'refused') return delivery.response;
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  /** The dashboard-owned session takes the text as its user's turn; a watched one through its inbox, as a peer's request. */
  async function deliveredToNamedSessionResponse(trackerId: string, sessionId: string, text: string): Promise<Response> {
    const dashboardOwned = orchestratorSessions.sessionOf(trackerId);
    if (dashboardOwned?.sessionId === sessionId) {
      const delivery = await orchestratorSessions.chat(trackerId, text);
      if (delivery.kind === 'none') return plainResponse(HTTP_STATUS.CONFLICT, 'The dashboard-owned orchestrator of this project has ended');
      if (delivery.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason);
      return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
    }
    const { projects } = monitor.snapshot();
    const dashboardOwnedSessions = projects
      .map((project) => orchestratorSessions.sessionOf(project.trackerId))
      .filter((session): session is OrchestratorSession => session !== null);
    const project = projects.find((projectSnapshot) => projectSnapshot.trackerId === trackerId);
    const watched = watchedSessionsOf(options.homeDirectory, project, dashboardOwnedSessions).find((session) => session.sessionId === sessionId);
    if (watched === undefined) return plainResponse(HTTP_STATUS.CONFLICT, `No live session ${sessionId} holds this project's dispatcher run`);
    const delivery = await writeSessionMessage(watched.messagingSocketPath, text, DASHBOARD_LIMITS.SESSION_SOCKET_TIMEOUT_MILLISECONDS);
    if (delivery.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  /** Only a dashboard-owned session's questions are answered here; a watched one answers in its own app. */
  async function orchestratorAnswerResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (!carriesLaunchGrant(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, bodyText } = projectRequest;
    const requestedAnswer = requestedAnswerOf(bodyText);
    if (requestedAnswer === null) return plainResponse(HTTP_STATUS.BAD_REQUEST, ORCHESTRATOR_ANSWER_BODY_REFUSAL);
    const session = orchestratorSessions.sessionOf(trackerId);
    if (session === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'No dashboard-owned orchestrator of this project runs');
    if (session.state === 'ended') return plainResponse(HTTP_STATUS.CONFLICT, 'The dashboard-owned orchestrator of this project has ended');
    const delivery = await orchestratorSessions.answer(trackerId, requestedAnswer.requestId, requestedAnswer.answers);
    if (delivery.kind === 'not-pending') return plainResponse(HTTP_STATUS.CONFLICT, `No question ${requestedAnswer.requestId} is pending`);
    if (delivery.kind === 'mismatched') return plainResponse(HTTP_STATUS.CONFLICT, delivery.reason);
    if (delivery.kind === 'none') return plainResponse(HTTP_STATUS.CONFLICT, 'The dashboard-owned orchestrator of this project has ended');
    if (delivery.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  /** A page elsewhere can neither read the token (no CORS grant) nor send this server's own `Origin`. */
  function carriesLaunchGrant(request: Request): boolean {
    const origin = request.headers.get('Origin');
    if (origin === null || !ownOrigins.has(origin)) return false;
    const presentedToken = Buffer.from(request.headers.get(DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME) ?? '');
    const expectedToken = Buffer.from(launchToken);
    return presentedToken.length === expectedToken.length && timingSafeEqual(presentedToken, expectedToken);
  }

  function launchTokenResponse(request: Request): Response {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const answerBody: LaunchToken = { token: launchToken };
    return Response.json(answerBody, { headers: NO_STORE_HEADERS });
  }

  /** Starts the supervisor in the project's root; the session, not the dashboard, writes the tracker from then on. */
  async function orchestratorStartResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (!carriesLaunchGrant(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    const projectRequest = await registeredProjectRequestOf(request, encodedTrackerId);
    if (projectRequest === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const { trackerId, root, bodyText } = projectRequest;
    const startBuilding = requestedStartBuildingOf(bodyText);
    if (startBuilding === null) return plainResponse(HTTP_STATUS.BAD_REQUEST, ORCHESTRATOR_START_BODY_REFUSAL);
    if (options.claudeExecutable === null) return plainResponse(HTTP_STATUS.BAD_GATEWAY, 'claude is not on PATH; set AGENT_DASHBOARD_CLAUDE to its path');
    const project = monitor.snapshot().projects.find((projectSnapshot) => projectSnapshot.trackerId === trackerId);
    const firstMessage = startBuilding ? orchestratorMessageTextOf({ kind: 'start-building' }, project?.project ?? trackerId, 'dashboard-session') : null;
    const launch = await orchestratorSessions.launch(trackerId, root, firstMessage);
    switch (launch.kind) {
      case 'started':
        return Response.json(launch.session, { status: HTTP_STATUS.CREATED, headers: NO_STORE_HEADERS });
      case 'running':
        return plainResponse(HTTP_STATUS.CONFLICT, 'A dashboard-owned orchestrator of this project already runs');
      case 'refused':
        return plainResponse(HTTP_STATUS.CONFLICT, launch.reason);
      case 'failed':
        return plainResponse(HTTP_STATUS.BAD_GATEWAY, launch.reason);
    }
  }

  async function orchestratorStopResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (!carriesLaunchGrant(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    const root = trackerId === null ? null : monitor.rootOf(trackerId);
    if (trackerId === null || root === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const delivery = await orchestratorSessions.stop(trackerId);
    if (delivery.kind === 'none') return plainResponse(HTTP_STATUS.NOT_FOUND, 'No dashboard-owned orchestrator of this project runs');
    if (delivery.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
  }

  /** Why a handoff may not start now, or null; each refusal changes nothing. */
  function handoffRefusalOf(trackerId: string, session: OrchestratorSession): string | null {
    if (session.state === 'ended') return 'The dashboard-owned orchestrator of this project has ended';
    if (session.pendingQuestions.length > 0 || session.state === 'waiting-for-answer') {
      return 'A question of the orchestrator is pending; answer it before handing off';
    }
    if (session.state !== 'idle') return `The orchestrator is ${session.state}; hand off once it is idle`;
    const project = monitor.snapshot().projects.find((projectSnapshot) => projectSnapshot.trackerId === trackerId);
    if (project?.health.kind !== 'ready') return 'The board cannot be read, so whether its dispatcher runs is unknown';
    // A fresh session is not proven to resume a Workflow run another session launched.
    if (project.health.board.dispatcherState === 'running') return 'The board\'s dispatcher is running; hand off once it has stopped or finished';
    return null;
  }

  /** Asks the running session for its note, keeps it, stops the session and starts a fresh one carrying it. */
  async function orchestratorHandoffResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (!carriesLaunchGrant(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    if (trackerId === null || monitor.rootOf(trackerId) === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    if (orchestratorSessions.sessionOf(trackerId) === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'No dashboard-owned orchestrator of this project runs');
    if (options.claudeExecutable === null) return plainResponse(HTTP_STATUS.BAD_GATEWAY, 'claude is not on PATH; set AGENT_DASHBOARD_CLAUDE to its path');
    if (trackersBeingHandedOff.has(trackerId)) return plainResponse(HTTP_STATUS.CONFLICT, 'A handoff of this project\'s orchestrator is already under way');
    trackersBeingHandedOff.add(trackerId);
    try {
      // The dispatcher state is read afresh, so a run launched since the last snapshot still refuses.
      await monitor.refreshProjectNow(trackerId);
      const refreshedRoot = monitor.rootOf(trackerId);
      if (refreshedRoot === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
      const session = orchestratorSessions.sessionOf(trackerId);
      if (session === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'No dashboard-owned orchestrator of this project runs');
      const refusal = handoffRefusalOf(trackerId, session);
      if (refusal !== null) return plainResponse(HTTP_STATUS.CONFLICT, refusal);
      const handoff = await handOffOrchestrator({
        orchestratorSessions,
        handoffDirectory:         handoffDirectoryOf(options.homeDirectory),
        trackerId,
        root:                     refreshedRoot,
        previousSession:          session,
        now:                      options.clock(),
        replyTimeoutMilliseconds: dependencies.handoffReplyTimeoutMilliseconds,
        endTimeoutMilliseconds:   DASHBOARD_LIMITS.HANDOFF_END_TIMEOUT_MILLISECONDS,
      });
      if (handoff.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, handoff.reason);
      const result: OrchestratorHandoffResult = { session: handoff.session, notePath: handoff.notePath };
      return Response.json(result, { status: HTTP_STATUS.CREATED, headers: NO_STORE_HEADERS });
    } finally {
      trackersBeingHandedOff.delete(trackerId);
    }
  }

  async function pageFileResponse(pathname: string): Promise<Response> {
    const notFound = plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const match = PAGE_ROUTE_PATTERN.exec(pathname);
    const trackerId = match?.[1] === undefined ? null : decodedOrNull(match[1]);
    const requestedPath = match?.[2] === undefined ? null : decodedOrNull(match[2]);
    if (trackerId === null || requestedPath === null) return notFound;
    const pageFolder = monitor.pageFolderOf(trackerId);
    if (pageFolder === null) return notFound;
    const verdict = resolveContainedPath(pageFolder, requestedPath);
    if (verdict.kind === 'refused') return notFound;
    const file = Bun.file(verdict.path);
    try {
      if (!(await file.stat()).isFile()) return notFound;
    } catch {
      return notFound;
    }
    return new Response(file, {
      headers: {
        'Content-Type':            file.type,
        'X-Content-Type-Options':  'nosniff',
        'Content-Security-Policy': contentSecurityPolicyOf(requestedPath, boardPagePolicy),
        ...NO_STORE_HEADERS,
      },
    });
  }

  function bridgePageResponse(): Response {
    return new Response(bridgePageOf(dashboardOrigins), {
      headers: {
        'Content-Type':            'text/html; charset=utf-8',
        'X-Content-Type-Options':  'nosniff',
        'Content-Security-Policy': bridgePagePolicyOf(dashboardSources),
        ...NO_STORE_HEADERS,
      },
    });
  }

  async function bridgeScriptResponse(): Promise<Response> {
    bridgeScript ??= builtBridgeScript();
    try {
      return new Response(await bridgeScript, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...NO_STORE_HEADERS }, });
    } catch {
      bridgeScript = null;
      return plainResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'The bridge script did not build');
    }
  }

  /** The board origin serves the page folders and the bridge, nothing under `/api/` and nothing of the dashboard's. */
  async function answerOnBoardOrigin(request: Request): Promise<Response> {
    if (!boardAllowedHosts.has(request.headers.get('Host') ?? '')) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden host');
    const { pathname } = new URL(request.url);
    const isBoardRoute = pathname === DASHBOARD_PROTOCOL.BOARD_BRIDGE_PATH || pathname === DASHBOARD_PROTOCOL.BOARD_BRIDGE_SCRIPT_PATH || PAGE_ROUTE_PATTERN.test(pathname);
    if (!isBoardRoute) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
    if (pathname === DASHBOARD_PROTOCOL.BOARD_BRIDGE_PATH) return bridgePageResponse();
    if (pathname === DASHBOARD_PROTOCOL.BOARD_BRIDGE_SCRIPT_PATH) return bridgeScriptResponse();
    await monitorStarted;
    return pageFileResponse(pathname);
  }

  async function answer(request: Request, servingServer: Bun.Server<undefined>): Promise<Response> {
    if (!allowedHosts.has(request.headers.get('Host') ?? '')) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden host');
    const { pathname } = new URL(request.url);
    const isRead = request.method === 'GET' || request.method === 'HEAD';

    if (pathname === DASHBOARD_PROTOCOL.SHUTDOWN_PATH) return request.method === 'POST' ? shutdownResponse(request) : methodNotAllowed('POST');
    if (pathname === DASHBOARD_PROTOCOL.RESTART_PATH) return request.method === 'POST' ? restartResponse(request) : methodNotAllowed('POST');
    if (pathname === DASHBOARD_PROTOCOL.IDENTITY_PATH) return isRead ? identityResponse() : methodNotAllowed('GET, HEAD');
    const concurrencyRouteMatch = CONCURRENCY_ROUTE_PATTERN.exec(pathname);
    if (concurrencyRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? concurrencyLimitResponse(request, concurrencyRouteMatch[1]) : methodNotAllowed('POST');
    }
    const dispatcherRouteMatch = DISPATCHER_ROUTE_PATTERN.exec(pathname);
    if (dispatcherRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? dispatcherStopResponse(request, dispatcherRouteMatch[1]) : methodNotAllowed('POST');
    }
    const orchestratorRequestsRouteMatch = ORCHESTRATOR_REQUESTS_ROUTE_PATTERN.exec(pathname);
    if (orchestratorRequestsRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? orchestratorRequestResponse(request, orchestratorRequestsRouteMatch[1]) : methodNotAllowed('POST');
    }
    const orchestratorRouteMatch = ORCHESTRATOR_ROUTE_PATTERN.exec(pathname);
    if (orchestratorRouteMatch?.[1] !== undefined) {
      if (request.method === 'POST') return orchestratorStartResponse(request, orchestratorRouteMatch[1]);
      return request.method === 'DELETE' ? orchestratorStopResponse(request, orchestratorRouteMatch[1]) : methodNotAllowed('POST, DELETE');
    }
    const orchestratorMessagesRouteMatch = ORCHESTRATOR_MESSAGES_ROUTE_PATTERN.exec(pathname);
    if (orchestratorMessagesRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? orchestratorChatResponse(request, orchestratorMessagesRouteMatch[1]) : methodNotAllowed('POST');
    }
    const orchestratorAnswersRouteMatch = ORCHESTRATOR_ANSWERS_ROUTE_PATTERN.exec(pathname);
    if (orchestratorAnswersRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? orchestratorAnswerResponse(request, orchestratorAnswersRouteMatch[1]) : methodNotAllowed('POST');
    }
    const orchestratorEventsRouteMatch = ORCHESTRATOR_EVENTS_ROUTE_PATTERN.exec(pathname);
    if (orchestratorEventsRouteMatch?.[1] !== undefined) {
      return request.method === 'GET' ? orchestratorEventsResponse(request, servingServer, orchestratorEventsRouteMatch[1]) : methodNotAllowed('GET');
    }
    const orchestratorHandoffRouteMatch = ORCHESTRATOR_HANDOFF_ROUTE_PATTERN.exec(pathname);
    if (orchestratorHandoffRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? orchestratorHandoffResponse(request, orchestratorHandoffRouteMatch[1]) : methodNotAllowed('POST');
    }
    if (pathname === DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH) return request.method === 'GET' ? launchTokenResponse(request) : methodNotAllowed('GET');
    if (pathname === '/api/snapshot' || pathname === '/api/events') {
      if (!isRead) return methodNotAllowed('GET, HEAD');
      await monitorStarted;
      if (pathname === '/api/snapshot') return Response.json(servedSnapshot(), { headers: NO_STORE_HEADERS });
      return snapshotEventsResponse(request, servingServer);
    }
    return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
  }

  // Returned while the first read runs: the identity answers at once, so `serve` must write its record at once too;
  // the data routes wait for that read themselves.
  return {
    kind:   'started',
    server: {
      url, port, boardOrigin, boardPort, stop, stopped, isRestartRequested: () => restartIsRequested
    }
  };
}

export function startDashboardServer(options: DashboardServerOptions): Promise<DashboardServerStart> {
  const monitor = createProjectMonitor({
    homeDirectory:   options.homeDirectory,
    readBoardStatus: (root) => readBoardStatus({
      executable:          options.agentProgressExecutable,
      runtimeExecutable:   options.runtimeExecutablePath,
      root,
      timeoutMilliseconds: DASHBOARD_LIMITS.STATUS_READ_TIMEOUT_MILLISECONDS,
    }),
    clock:                        options.clock,
    quietMilliseconds:            DASHBOARD_LIMITS.REFRESH_QUIET_MILLISECONDS,
    maximumWaitMilliseconds:      DASHBOARD_LIMITS.REFRESH_MAXIMUM_WAIT_MILLISECONDS,
    sweepIntervalMilliseconds:    DASHBOARD_LIMITS.SAFETY_SWEEP_INTERVAL_MILLISECONDS,
    maximumConcurrentStatusReads: DASHBOARD_LIMITS.MAXIMUM_CONCURRENT_STATUS_READS,
    machineParallelAgentLimit:    options.machineParallelAgentLimit,
  });
  return serveDashboard(options, {
    monitor,
    orchestratorSessions:            createDashboardOrchestratorSessions(options),
    heartbeatIntervalMilliseconds:   DASHBOARD_LIMITS.HEARTBEAT_INTERVAL_MILLISECONDS,
    handoffReplyTimeoutMilliseconds: DASHBOARD_LIMITS.HANDOFF_REPLY_TIMEOUT_MILLISECONDS,
  });
}
