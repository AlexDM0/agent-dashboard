/**
 * The dashboard's HTTP servers, bound to 127.0.0.1 only. The dashboard origin: the React app, the server identity, the
 * snapshot and its event stream, a project's concurrency limit set and its dispatcher stopped through its agent-progress
 * CLI, a message to a board's orchestrator Claude Code session, and a shutdown the CLI's `stop` asks for. The board
 * origin, a port of its own: each project's page folder and the bridge page, so no board page is same-origin with the
 * dashboard. Every route but the app shell refuses a request whose Host is not its server's own, against DNS rebinding;
 * Bun answers the shell before `fetch`, and it holds no data.
 */
import { join, normalize } from 'node:path';

import dashboardApplication from '../../web/index.html';

import { readBoardStatus }                                                                     from '../adapters/BoardStatusReader.ts';
import { writeConcurrencyLimit }                                                               from '../adapters/ConcurrencyLimitWriter.ts';
import { writeDispatcherStopped }                                                              from '../adapters/DispatcherStopWriter.ts';
import { findOrchestratorSession }                                                             from '../adapters/OrchestratorSessionFinder.ts';
import { sessionSocketAccepts, writeSessionMessage }                                           from '../adapters/SessionMessageWriter.ts';
import { resolveContainedPath }                                                                from '../lib/contained-path/ContainedPath.ts';
import { type DashboardSnapshot, type ServerIdentity }                                         from '../shared/DashboardContract.ts';
import { UnknownValueUtil }                                                                    from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }                                                                     from '../shared/constants/DashboardFiles.ts';
import { DASHBOARD_LIMITS }                                                                    from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                                                                  from '../shared/constants/DashboardProtocol.ts';
import { ORCHESTRATOR_REQUEST_BODY_REFUSAL, orchestratorMessageTextOf, orchestratorRequestOf } from './OrchestratorRequestMessage.ts';
import { type MonitoredSnapshot, type ProjectMonitor, createProjectMonitor }                   from './ProjectMonitor.ts';

export interface DashboardServerOptions {
  port:                      number;
  homeDirectory:             string;
  agentProgressExecutable:   string | null;
  /** The Bun running the server, which runs a Bun-script agent-progress itself. */
  runtimeExecutablePath:     string;
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

const HTTP_STATUS = {
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

/** The monitor's snapshot with every page addressed on the board origin. */
function servedSnapshotOf(monitored: MonitoredSnapshot, boardOrigin: string): DashboardSnapshot {
  return {
    ...monitored,
    projects:       monitored.projects.map((project) => ({ ...project, pageUrl: `${boardOrigin}${project.pageUrl}` })),
    boardOrigin,
    boardBridgeUrl: `${boardOrigin}${DASHBOARD_PROTOCOL.BOARD_BRIDGE_PATH}`,
  };
}

function snapshotEvent(snapshot: DashboardSnapshot): string {
  return `event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`;
}

interface ServingDependencies {
  monitor:                       ProjectMonitor;
  heartbeatIntervalMilliseconds: number;
}

/** The server with its monitor given; `startDashboardServer` builds the real monitor, a spec may pass its own. */
export async function serveDashboard(options: DashboardServerOptions, dependencies: ServingDependencies): Promise<DashboardServerStart> {
  const { monitor } = dependencies;
  const closeOpenStreams = new Set<() => void>();
  let stopping: Promise<void> | null = null;
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
      routes:      { '/': dashboardApplication },
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

  function servedSnapshot(): DashboardSnapshot {
    return servedSnapshotOf(monitor.snapshot(), boardOrigin);
  }

  function stop(): Promise<void> {
    stopping ??= (async () => {
      for (const closeStream of [...closeOpenStreams]) closeStream();
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

  function eventStreamResponse(request: Request, servingServer: Bun.Server<undefined>): Response {
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
        const unsubscribe = monitor.subscribe((snapshot) => send(snapshotEvent(servedSnapshotOf(snapshot, boardOrigin))));
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
        releaseStream = () => {
          if (released) return;
          released = true;
          unsubscribe();
          clearInterval(heartbeat);
          closeOpenStreams.delete(closeStream);
        };
        closeOpenStreams.add(closeStream);
        request.signal.addEventListener('abort', () => releaseStream());
        send(snapshotEvent(servedSnapshot()));
      },
      cancel() {
        releaseStream();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Connection': 'keep-alive', ...NO_STORE_HEADERS }, });
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

  function isForeignOrigin(request: Request): boolean {
    const origin = request.headers.get('Origin');
    return origin !== null && !ownOrigins.has(origin);
  }

  async function concurrencyLimitResponse(request: Request, encodedTrackerId: string): Promise<Response> {
    if (isForeignOrigin(request)) return plainResponse(HTTP_STATUS.FORBIDDEN, 'Forbidden');
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    const root = trackerId === null ? null : monitor.rootOf(trackerId);
    if (trackerId === null || root === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const limit = requestedConcurrencyLimitOf(await request.text().catch(() => ''));
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
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    const root = trackerId === null ? null : monitor.rootOf(trackerId);
    if (trackerId === null || root === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    if (!isDispatcherStopBody(await request.text().catch(() => ''))) return plainResponse(HTTP_STATUS.BAD_REQUEST, DISPATCHER_BODY_REFUSAL);
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
    await monitorStarted;
    const trackerId = decodedOrNull(encodedTrackerId);
    const root = trackerId === null ? null : monitor.rootOf(trackerId);
    if (trackerId === null || root === null) return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
    const orchestratorRequest = orchestratorRequestOf(await request.text().catch(() => ''));
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

    const search = await findOrchestratorSession({
      homeDirectory:   options.homeDirectory,
      projectRoot:     root,
      dispatcherRunId: board?.dispatcherRunId ?? null,
      socketAccepts:   (socketPath) => sessionSocketAccepts(socketPath, DASHBOARD_LIMITS.SESSION_SOCKET_TIMEOUT_MILLISECONDS),
    });
    if (search.kind === 'refused') return plainResponse(HTTP_STATUS.CONFLICT, search.reason);
    const messageText = orchestratorMessageTextOf(orchestratorRequest, project?.project ?? trackerId);
    const delivery = await writeSessionMessage(search.session.messagingSocketPath, messageText, DASHBOARD_LIMITS.SESSION_SOCKET_TIMEOUT_MILLISECONDS);
    if (delivery.kind === 'failed') return plainResponse(HTTP_STATUS.BAD_GATEWAY, delivery.reason);
    return new Response(null, { status: HTTP_STATUS.NO_CONTENT, headers: NO_STORE_HEADERS });
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
    if (pathname === DASHBOARD_PROTOCOL.IDENTITY_PATH) return isRead ? identityResponse() : methodNotAllowed('GET, HEAD');
    const concurrencyRouteMatch = CONCURRENCY_ROUTE_PATTERN.exec(pathname);
    if (concurrencyRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? concurrencyLimitResponse(request, concurrencyRouteMatch[1]) : methodNotAllowed('POST');
    }
    const dispatcherRouteMatch = DISPATCHER_ROUTE_PATTERN.exec(pathname);
    if (dispatcherRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? dispatcherStopResponse(request, dispatcherRouteMatch[1]) : methodNotAllowed('POST');
    }
    const orchestratorRouteMatch = ORCHESTRATOR_REQUESTS_ROUTE_PATTERN.exec(pathname);
    if (orchestratorRouteMatch?.[1] !== undefined) {
      return request.method === 'POST' ? orchestratorRequestResponse(request, orchestratorRouteMatch[1]) : methodNotAllowed('POST');
    }
    if (pathname === '/api/snapshot' || pathname === '/api/events') {
      if (!isRead) return methodNotAllowed('GET, HEAD');
      await monitorStarted;
      if (pathname === '/api/snapshot') return Response.json(servedSnapshot(), { headers: NO_STORE_HEADERS });
      return eventStreamResponse(request, servingServer);
    }
    return plainResponse(HTTP_STATUS.NOT_FOUND, 'Not found');
  }

  // Returned while the first read runs: the identity answers at once, so `serve` must write its record at once too;
  // the data routes wait for that read themselves.
  return {
    kind:   'started',
    server: {
      url, port, boardOrigin, boardPort, stop, stopped
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
  return serveDashboard(options, { monitor, heartbeatIntervalMilliseconds: DASHBOARD_LIMITS.HEARTBEAT_INTERVAL_MILLISECONDS });
}
