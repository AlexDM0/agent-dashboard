/**
 * A real server on a free port over a scratch home whose registry names one scratch project, its board read by a fake
 * agent-progress printing a captured status document. The cases are the server's promises: the Host guard on every
 * data route (the app shell, which Bun answers first, holds no data), the page route serving only what lies inside the
 * page folder (planted escapes: `../`, encoded `%2e%2e`, an encoded slash, NUL, a symlink out) with every file but the
 * board page sandboxed, the page folders and the bridge served only on the board origin (its own port and Host guard,
 * framed only by the dashboard) and nothing of the dashboard's there, 404s, the event stream opening with a snapshot
 * and releasing its subscription on disconnect, the page's one stream carrying each subscribed conversation's history
 * then live messages, tagged, releasing them all with the stream and refusing them to a foreign Origin, a shutdown only
 * the CLI can ask for, a held port reported, not thrown, a second dashboard never sharing the port, and a start that
 * answers its identity before the first board read ends, since the CLI writes the server record as soon as the start resolves.
 * The concurrency route, the one write, is proven against a fake CLI that keeps a limit and logs its calls: a foreign
 * Origin, an unknown tracker and an out-of-range limit never reach the CLI, a CLI refusal and failure map to 409 and
 * 502, and a 204 is followed by a snapshot carrying the new limit without any change in the watched folder; a project
 * unregistered while its body still arrives is 404, since every project route looks the root up after the body. The
 * dispatcher route is proven the same way against a fake keeping a dispatcher state: only `{ "state": "stopped" }`
 * reaches the CLI, and its 204 is followed by a snapshot showing the dispatcher stopped.
 * The orchestrator-request route is proven against scratch Unix-socket listeners standing in for Claude Code sessions
 * under a scratch home: the exact line a session receives, no write on any refusal (guards, a bad body, an id that is
 * not low-priority waiting, zero or several candidates), and 502 when the chosen session's socket fails; a live
 * dashboard-owned session (stubbed) takes the text as its chat instead, and the answer names which of the two it reached.
 * Watched sessions: the snapshot lists only the live holders of the board's dispatcher run, none without a run, with its
 * record's name and status and its transcript's usage (unknown without one) and never probes their sockets; a chat
 * naming one reaches it alone, and a gone session or a root session without the run is 409, a malformed body 400 and a
 * missing launch grant 403, none writing.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:net';
import { join }                      from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  test
} from 'bun:test';

import {
  type ChatMessage,
  type DashboardSnapshot,
  type LaunchToken,
  type ServerIdentity
} from '../shared/DashboardContract.ts';
import { DASHBOARD_PROTOCOL }                                                   from '../shared/constants/DashboardProtocol.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry } from '../testing/ExampleBoards.ts';
import {
  EXAMPLE_SESSION_STARTED_AT,
  type ExampleSessionListener,
  createExampleWorkflowRun,
  exampleAssistantLine,
  exitedProcessId,
  listenAsExampleSession,
  writeExampleSessionRecord,
  writeExampleTranscript
} from '../testing/ExampleClaudeSessions.ts';
import {
  fakeExecutableFailing,
  fakeExecutableKeepingAConcurrencyLimit,
  fakeExecutableKeepingADispatcherState,
  fakeExecutablePrinting,
  fakeExecutablePrintingOnceReleased
} from '../testing/FakeAgentProgressExecutable.ts';
import { sendRawHttpRequest }                                                      from '../testing/RawHttpRequest.ts';
import { type ScratchDashboardFolderContents, writeScratchDashboardFolder }        from '../testing/ScratchDashboardFolder.ts';
import { createScratchDirectory, removeScratchDirectory, requireScratchDirectory } from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                               from '../testing/WaitUntil.ts';
import {
  type DashboardServerOptions,
  type RunningDashboardServer,
  allowedHostHeadersOf,
  boardPortOf,
  createDashboardOrchestratorSessions,
  serveDashboard,
  startDashboardServer
} from './DashboardServer.ts';
import { orchestratorMessageTextOf }                 from './OrchestratorRequestMessage.ts';
import { type ProjectMonitor, createProjectMonitor } from './ProjectMonitor.ts';

const TRACKER_ID = 'tracker-storefront';
const EXAMPLE_INSTANT = new Date('2026-10-21T12:00:00.000Z');
const EXAMPLE_VERSION = '0.0.0-example';
const EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT = 12;
const SHORT_HEARTBEAT_MILLISECONDS = 30;
const DASHBOARD_DIRECTORY = join(import.meta.dir, '..', '..');

let scratchDirectory = '';
let projectRoot = '';
let serverOptions: DashboardServerOptions;
let server: RunningDashboardServer;
const extraServers: RunningDashboardServer[] = [];

function startedOrThrow(start: Awaited<ReturnType<typeof startDashboardServer>>): RunningDashboardServer {
  if (start.kind !== 'started') throw new Error(`the server did not start: port ${start.port} in use`);
  return start.server;
}

beforeAll(async () => {
  scratchDirectory = createScratchDirectory('dashboard-server');
  const homeDirectory = join(scratchDirectory, 'home');
  mkdirSync(homeDirectory);
  requireScratchDirectory(homeDirectory);
  projectRoot = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  const pageFolder = join(projectRoot, '.agent-progress');
  mkdirSync(join(pageFolder, 'assets'));
  writeFileSync(join(pageFolder, 'assets', 'example.css'), 'body { color: black; }');
  writeFileSync(join(pageFolder, 'progress.stamp.js'), 'window.stamp = "example";');
  writeFileSync(join(pageFolder, 'example-diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/snapshot")</script></svg>');
  writeFileSync(join(projectRoot, 'secret.txt'), 'Example Agency secret');
  symlinkSync(join(projectRoot, 'secret.txt'), join(pageFolder, 'escape.txt'));
  symlinkSync(projectRoot, join(pageFolder, 'escape-folder'));
  writeExampleRegistry(homeDirectory, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });

  serverOptions = {
    port:                      0,
    homeDirectory,
    agentProgressExecutable:   fakeExecutablePrinting(scratchDirectory, statusDocumentPath()),
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    dashboardDirectory:        DASHBOARD_DIRECTORY,
    claudeExecutable:          null,
    version:                   EXAMPLE_VERSION,
    clock:                     () => EXAMPLE_INSTANT,
    machineParallelAgentLimit: EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
  };
  server = startedOrThrow(await startDashboardServer(serverOptions));
});

afterEach(async () => {
  for (const extraServer of extraServers.splice(0)) await extraServer.stop();
});

afterAll(async () => {
  await server.stop();
  removeScratchDirectory(scratchDirectory);
});

function statusDocumentPath(): string {
  return join(import.meta.dir, '..', 'adapters', 'testing', 'ScratchTrackerStatusDocument.json');
}

function pageTarget(path: string): string {
  return `/projects/${TRACKER_ID}/page/${path}`;
}

test('the server binds 127.0.0.1 and answers its identity', async () => {
  expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
  const response = await fetch(`${server.url}/api/identity`);
  expect(response.status).toBe(200);
  expect(await response.json() as ServerIdentity).toEqual({ application: 'agent-dashboard', version: EXAMPLE_VERSION, pid: process.pid });
});

test('the snapshot holds the registered project with its board read through agent-progress', async () => {
  const snapshot = await (await fetch(`${server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshot.registry).toEqual({ kind: 'ready' });
  expect(snapshot.projects.map((project) => [project.trackerId, project.pageAvailable, project.health.kind])).toEqual([[TRACKER_ID, true, 'ready']]);
  expect(snapshot.projects[0]?.pageUrl).toBe(`${server.boardOrigin}${pageTarget('progress.html')}`);
});

test('the board origin is the loopback address on a port of its own, carried in the snapshot with the bridge', async () => {
  expect(server.boardPort).not.toBe(server.port);
  expect(server.boardOrigin).toBe(`http://127.0.0.1:${server.boardPort}`);
  const snapshot = await (await fetch(`${server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshot.boardOrigin).toBe(server.boardOrigin);
  expect(snapshot.boardBridgeUrl).toBe(`${server.boardOrigin}/bridge`);
  expect(boardPortOf(4710)).toBe(4711);
});

test('the snapshot carries the machine parallel agent limit the server was started with', async () => {
  const snapshot = await (await fetch(`${server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshot.machineParallelAgentLimit).toBe(EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT);
});

test('a Host that is not this server\'s own is refused on every data route, and each loopback name is let in', async () => {
  const dataRouteTargets = [
    '/api/identity',
    '/api/snapshot',
    '/api/events',
    '/api/shutdown',
    `/api/projects/${TRACKER_ID}/concurrency`,
    `/api/projects/${TRACKER_ID}/dispatcher`,
  ];
  for (const target of dataRouteTargets) {
    for (const host of ['evil.example', `evil.example:${server.port}`, '127.0.0.1:1', '127.0.0.1']) {
      const answer = await sendRawHttpRequest({ port: server.port, target, headers: { Host: host } });
      expect(answer.status, `${host} ${target}`).toBe(403);
    }
  }
  for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`, `[::1]:${server.port}`]) {
    expect((await sendRawHttpRequest({ port: server.port, target: '/api/identity', headers: { Host: host } })).status, host).toBe(200);
  }
});

test('the board origin keeps the Host guard on its own port for every route', async () => {
  for (const target of [pageTarget('progress.html'), '/bridge', '/bridge.js']) {
    for (const host of ['evil.example', `evil.example:${server.boardPort}`, `127.0.0.1:${server.port}`, '127.0.0.1']) {
      const answer = await sendRawHttpRequest({ port: server.boardPort, target, headers: { Host: host } });
      expect(answer.status, `${host} ${target}`).toBe(403);
    }
    for (const host of [`127.0.0.1:${server.boardPort}`, `localhost:${server.boardPort}`, `[::1]:${server.boardPort}`]) {
      expect((await sendRawHttpRequest({ port: server.boardPort, target, headers: { Host: host } })).status, `${host} ${target}`).toBe(200);
    }
  }
});

test('the app shell answers a foreign Host, as Bun serves it before the guard, and carries no board data', async () => {
  const answer = await sendRawHttpRequest({ port: server.port, target: '/', headers: { Host: 'evil.example' } });
  expect(answer.status).toBe(200);
  expect(answer.body).not.toContain(TRACKER_ID);
  expect(answer.body).not.toContain(projectRoot);
});

async function serverOverDashboardFolder(folderName: string, contents: ScratchDashboardFolderContents): Promise<RunningDashboardServer> {
  const dashboardDirectory = join(scratchDirectory, folderName);
  mkdirSync(dashboardDirectory);
  writeScratchDashboardFolder(dashboardDirectory, contents);
  const extraServer = startedOrThrow(await startDashboardServer({ ...serverOptions, port: 0, dashboardDirectory }));
  extraServers.push(extraServer);
  return extraServer;
}

test('a declared package missing from the dashboard folder makes / a 503 page naming it and the fix, while the API still answers', async () => {
  const unbuildable = await serverOverDashboardFolder('dashboard-missing-package', {
    declared:  ['example-installed-package', 'example-missing-package'],
    installed: ['example-installed-package'],
  });
  expect(unbuildable.dependencyResolution).toEqual({ kind: 'unresolvable', packageNames: ['example-missing-package'] });
  const page = await sendRawHttpRequest({ port: unbuildable.port, target: '/' });
  expect(page.status).toBe(503);
  expect(page.headers.get('content-type')).toStartWith('text/html');
  expect(page.body).toContain('<code>example-missing-package</code>');
  expect(page.body).not.toContain('<code>example-installed-package</code>');
  expect(page.body).toContain('bun run setup');
  expect(page.body).toContain('Restart server');
  const snapshot = await sendRawHttpRequest({ port: unbuildable.port, target: '/api/snapshot' });
  expect(snapshot.status).toBe(200);
  expect((JSON.parse(snapshot.body) as DashboardSnapshot).projects.map((project) => project.trackerId)).toEqual([TRACKER_ID]);
});

test('the missing-packages page names a local folder, so a foreign Host is refused it as the API refuses one', async () => {
  const unbuildable = await serverOverDashboardFolder('dashboard-missing-package-foreign-host', { declared: ['example-missing-package'], installed: [] });
  const answer = await sendRawHttpRequest({ port: unbuildable.port, target: '/', headers: { Host: 'evil.example' } });
  expect(answer.status).toBe(403);
  expect(answer.body).not.toContain(scratchDirectory);
});

test('with every declared package installed / serves the dashboard shell as before', async () => {
  const buildable = await serverOverDashboardFolder('dashboard-installed', { declared: ['example-installed-package'], installed: ['example-installed-package'] });
  expect(buildable.dependencyResolution).toEqual({ kind: 'resolvable' });
  const shell = await sendRawHttpRequest({ port: buildable.port, target: '/' });
  expect(shell.status).toBe(200);
  expect(shell.body).toContain('<link rel="manifest"');
  expect(shell.body).toBe((await sendRawHttpRequest({ port: server.port, target: '/' })).body);
});

test('the app shell links a web app manifest whose name, start URL and icons are served beside it, before the Host guard as the shell is', async () => {
  const shell = await sendRawHttpRequest({ port: server.port, target: '/' });
  const manifestPath = /<link rel="manifest" href="([^"]+)"/.exec(shell.body)?.[1] ?? '';
  for (const host of ['evil.example', `127.0.0.1:${server.port}`]) {
    const manifestAnswer = await sendRawHttpRequest({ port: server.port, target: manifestPath, headers: { Host: host } });
    expect(manifestAnswer.status, `${host} ${manifestPath}`).toBe(200);
    const manifest = JSON.parse(manifestAnswer.body) as { name: string; start_url: string; icons: { src: string; sizes: string }[] };
    expect(manifest.name).toBe('agent-dashboard');
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons) {
      const iconAnswer = await sendRawHttpRequest({ port: server.port, target: icon.src, headers: { Host: host } });
      expect(iconAnswer.status, `${host} ${icon.src}`).toBe(200);
      expect(iconAnswer.headers.get('content-type')).toBe('image/png');
    }
  }
});

test('on the default HTTP port the bare loopback names are let in too, since a browser sends no port there', () => {
  expect([...allowedHostHeadersOf(80)].sort()).toEqual(['127.0.0.1', '127.0.0.1:80', '[::1]', '[::1]:80', 'localhost', 'localhost:80']);
  expect([...allowedHostHeadersOf(4710)].sort()).toEqual(['127.0.0.1:4710', '[::1]:4710', 'localhost:4710']);
});

test('the board page and its stamp may reach only the board origin, framed only by the dashboard, and every other page-folder file is sandboxed', async () => {
  for (const target of [pageTarget('progress.html'), pageTarget('progress.stamp.js'), pageTarget('./progress.html')]) {
    const policy = (await sendRawHttpRequest({ port: server.boardPort, target })).headers.get('content-security-policy') ?? '';
    expect(policy, target).toContain('connect-src \'self\'');
    expect(policy, target).toContain('default-src \'self\'');
    expect(policy, target).toContain(`frame-ancestors http://127.0.0.1:${server.port} http://localhost:${server.port}`);
  }
  for (const target of [pageTarget('example-diagram.svg'), pageTarget('assets/example.css')]) {
    const answer = await sendRawHttpRequest({ port: server.boardPort, target });
    expect(answer.status, target).toBe(200);
    expect(answer.headers.get('content-security-policy'), target).toBe('sandbox');
  }
});

test('a page file is served with its content type and no caching', async () => {
  const page = await sendRawHttpRequest({ port: server.boardPort, target: pageTarget('progress.html') });
  expect(page.status).toBe(200);
  expect(page.headers.get('content-type')).toStartWith('text/html');
  expect(page.headers.get('cache-control')).toBe('no-store');
  expect(page.body).toContain('<title>example-storefront</title>');

  const stylesheet = await sendRawHttpRequest({ port: server.boardPort, target: pageTarget('assets/example.css') });
  expect(stylesheet.headers.get('content-type')).toStartWith('text/css');
  const stamp = await sendRawHttpRequest({ port: server.boardPort, target: pageTarget('progress.stamp.js') });
  expect(stamp.headers.get('content-type')).toStartWith('text/javascript');
});

test('every way out of the page folder is a 404, the planted secret never served', async () => {
  const escapes = [
    pageTarget('../secret.txt'),
    pageTarget('../../../secret.txt'),
    pageTarget('%2e%2e/secret.txt'),
    pageTarget('%2E%2E%2Fsecret.txt'),
    pageTarget('assets%2F..%2F..%2Fsecret.txt'),
    pageTarget('escape.txt'),
    pageTarget('escape-folder/secret.txt'),
    pageTarget('progress.html%00.txt'),
    pageTarget(encodeURIComponent(join(projectRoot, 'secret.txt'))),
    `/projects/${TRACKER_ID}/page/%`,
  ];
  for (const target of escapes) {
    const answer = await sendRawHttpRequest({ port: server.boardPort, target });
    expect(answer.status, target).toBe(404);
    expect(answer.body, target).not.toContain('secret');
  }
});

test('an unknown tracker, a missing file, a folder and an unknown route are 404', async () => {
  for (const target of ['/projects/tracker-unknown/page/progress.html', pageTarget('absent.html'), pageTarget('assets'), pageTarget(''), '/projects']) {
    expect((await sendRawHttpRequest({ port: server.boardPort, target })).status, target).toBe(404);
  }
  expect((await sendRawHttpRequest({ port: server.port, target: '/api/unknown' })).status).toBe(404);
});

test('the dashboard origin serves no board file, and the board origin nothing of the dashboard\'s', async () => {
  for (const target of [pageTarget('progress.html'), pageTarget('progress.stamp.js'), pageTarget('assets/example.css'), '/bridge', '/bridge.js']) {
    expect((await sendRawHttpRequest({ port: server.port, target })).status, target).toBe(404);
  }
  for (const target of ['/api/identity', '/api/snapshot', '/api/events', `/api/projects/${TRACKER_ID}/concurrency`, '/api/shutdown', '/']) {
    expect((await sendRawHttpRequest({ port: server.boardPort, target })).status, target).toBe(404);
  }
  const boardOriginPost = await sendRawHttpRequest({
    port: server.boardPort, method: 'POST', target: '/api/shutdown', headers: { [DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_NAME]: DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_VALUE }
  });
  expect(boardOriginPost.status).toBe(404);
  expect((await fetch(`${server.url}/api/identity`)).status).toBe(200);
});

test('a fetch from the board origin to the dashboard\'s snapshot carries no CORS grant, so the board cannot read it', async () => {
  const answer = await fetch(`${server.url}/api/snapshot`, { headers: { Origin: server.boardOrigin } });
  expect(answer.headers.get('access-control-allow-origin')).toBeNull();
  expect(answer.headers.get('access-control-allow-credentials')).toBeNull();
});

test('the bridge page is framed only by the dashboard, runs only its own script, and names the dashboard origins it answers', async () => {
  const bridge = await sendRawHttpRequest({ port: server.boardPort, target: '/bridge' });
  expect(bridge.status).toBe(200);
  expect(bridge.headers.get('content-type')).toStartWith('text/html');
  const policy = bridge.headers.get('content-security-policy') ?? '';
  expect(policy).toContain('default-src \'none\'');
  expect(policy).toContain('script-src \'self\'');
  expect(policy).toContain(`frame-ancestors http://127.0.0.1:${server.port} http://localhost:${server.port}`);
  expect(bridge.body).toContain(`data-dashboard-origins="http://127.0.0.1:${server.port} http://localhost:${server.port}"`);
  expect(bridge.body).toContain('<script src="/bridge.js"></script>');

  const script = await sendRawHttpRequest({ port: server.boardPort, target: '/bridge.js' });
  expect(script.status).toBe(200);
  expect(script.headers.get('content-type')).toStartWith('text/javascript');
  expect(script.body).toContain('agent-dashboard-board');
});

test('the app is served at the root', async () => {
  const response = await fetch(`${server.url}/`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toStartWith('text/html');
  expect(await response.text()).toContain('<script');
});

test('the event stream opens with a snapshot event', async () => {
  const abort = new AbortController();
  const response = await fetch(`${server.url}/api/events`, { signal: abort.signal });
  expect(response.headers.get('content-type')).toStartWith('text/event-stream');
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  let received = '';
  while (!received.includes('\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  abort.abort();
  const [eventLine = '', dataLine = ''] = received.split('\n');
  expect(eventLine).toBe('event: snapshot');
  const snapshot = JSON.parse(dataLine.replace(/^data: /, '')) as DashboardSnapshot;
  expect(snapshot.projects.map((project) => project.trackerId)).toEqual([TRACKER_ID]);
  expect(snapshot.machineParallelAgentLimit).toBe(EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT);
});

test('an event stream sends heartbeats and releases its subscription when the client goes', async () => {
  const realMonitor = createProjectMonitor({
    homeDirectory:                serverOptions.homeDirectory,
    readBoardStatus:              () => Promise.resolve({ kind: 'unreadable', reason: 'Example' }),
    clock:                        () => EXAMPLE_INSTANT,
    quietMilliseconds:            SHORT_HEARTBEAT_MILLISECONDS,
    maximumWaitMilliseconds:      60_000,
    sweepIntervalMilliseconds:    60_000,
    maximumConcurrentStatusReads: 1,
    machineParallelAgentLimit:    EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
  });
  let subscriberCount = 0;
  const countingMonitor: ProjectMonitor = {
    ...realMonitor,
    subscribe(listener) {
      subscriberCount++;
      const unsubscribe = realMonitor.subscribe(listener);
      return () => {
        subscriberCount--;
        unsubscribe();
      };
    },
  };
  const extraServer = startedOrThrow(await serveDashboard(serverOptions, {
    monitor:                         countingMonitor,
    orchestratorSessions:            createDashboardOrchestratorSessions(serverOptions),
    productOwnerSessions:            createDashboardOrchestratorSessions(serverOptions, {}, 'product-owner'),
    heartbeatIntervalMilliseconds:   SHORT_HEARTBEAT_MILLISECONDS,
    handoffReplyTimeoutMilliseconds: SHORT_HEARTBEAT_MILLISECONDS,
  }));
  extraServers.push(extraServer);

  const abort = new AbortController();
  const response = await fetch(`${extraServer.url}/api/events`, { signal: abort.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  let received = '';
  while (!received.includes(': heartbeat\n\n')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += new TextDecoder().decode(value);
  }
  expect(received).toContain(': heartbeat\n\n');
  expect(subscriberCount).toBe(1);

  abort.abort();
  const deadline = performance.now() + 2_000;
  while (subscriberCount > 0 && performance.now() < deadline) await Bun.sleep(10);
  expect(subscriberCount).toBe(0);
});

interface ServerSentEvent { eventName: string; data: unknown }

async function* serverSentEventsOf(response: Response): AsyncGenerator<ServerSentEvent> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  const decoder = new TextDecoder();
  let received = '';
  for (;;) {
    let separator = received.indexOf('\n\n');
    while (separator !== -1) {
      const lines = received.slice(0, separator).split('\n');
      received = received.slice(separator + 2);
      const eventLine = lines.find((line) => line.startsWith('event: '));
      const dataLine = lines.find((line) => line.startsWith('data: '));
      if (eventLine !== undefined && dataLine !== undefined) {
        yield { eventName: eventLine.slice('event: '.length), data: JSON.parse(dataLine.slice('data: '.length)) };
      }
      separator = received.indexOf('\n\n');
    }
    const { value, done } = await reader.read();
    if (done) return;
    received += decoder.decode(value, { stream: true });
  }
}

async function nextEventOf(events: AsyncGenerator<ServerSentEvent>): Promise<ServerSentEvent> {
  const next = await events.next();
  if (next.done === true) throw new Error('the event stream ended');
  return next.value;
}

/** A server whose dashboard-owned conversations are held in memory: a history per role, and a listener to push a message through. */
async function startConversationServer(): Promise<{
  conversationServer: RunningDashboardServer;
  sendMessage:        (role: 'orchestrator' | 'product-owner', text: string) => void;
  listenerCount:      () => number;
}> {
  const listenersByRole = { 'orchestrator': new Set<(message: ChatMessage) => void>(), 'product-owner': new Set<(message: ChatMessage) => void>() };
  const sessionsHolding = (role: 'orchestrator' | 'product-owner'): ReturnType<typeof createDashboardOrchestratorSessions> => ({
    ...createDashboardOrchestratorSessions(serverOptions, {}, role),
    conversationOf: (trackerId) => (trackerId === TRACKER_ID ? [{ at: EXAMPLE_INSTANT.toISOString(), role: 'assistant', text: `${role} history` }] : []),
    subscribeToConversation(trackerId, listener) {
      if (trackerId !== TRACKER_ID) return () => undefined;
      listenersByRole[role].add(listener);
      return () => listenersByRole[role].delete(listener);
    },
  });
  const conversationServer = startedOrThrow(await serveDashboard(serverOptions, {
    monitor: createProjectMonitor({
      homeDirectory:                serverOptions.homeDirectory,
      readBoardStatus:              () => Promise.resolve({ kind: 'unreadable', reason: 'Example' }),
      clock:                        () => EXAMPLE_INSTANT,
      quietMilliseconds:            SHORT_HEARTBEAT_MILLISECONDS,
      maximumWaitMilliseconds:      60_000,
      sweepIntervalMilliseconds:    60_000,
      maximumConcurrentStatusReads: 1,
      machineParallelAgentLimit:    EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
    }),
    orchestratorSessions:            sessionsHolding('orchestrator'),
    productOwnerSessions:            sessionsHolding('product-owner'),
    heartbeatIntervalMilliseconds:   60_000,
    handoffReplyTimeoutMilliseconds: SHORT_HEARTBEAT_MILLISECONDS,
  }));
  extraServers.push(conversationServer);
  return {
    conversationServer,
    sendMessage(role, text) {
      for (const listener of listenersByRole[role]) listener({ at: EXAMPLE_INSTANT.toISOString(), role: 'assistant', text });
    },
    listenerCount: () => listenersByRole['orchestrator'].size + listenersByRole['product-owner'].size,
  };
}

test('one stream carries the snapshot, then each subscribed conversation\'s history, then its live messages, each tagged', async () => {
  const { conversationServer, sendMessage, listenerCount } = await startConversationServer();
  const abort = new AbortController();
  const query = `orchestrator=${TRACKER_ID}&product-owner=${TRACKER_ID}&orchestrator=tracker-unregistered`;
  const events = serverSentEventsOf(await fetch(`${conversationServer.url}/api/events?${query}`, { signal: abort.signal }));
  try {
    expect((await nextEventOf(events)).eventName).toBe('snapshot');
    expect(await nextEventOf(events)).toEqual({
      eventName: 'conversation-history',
      data:      { role: 'orchestrator', trackerId: TRACKER_ID, messages: [{ at: EXAMPLE_INSTANT.toISOString(), role: 'assistant', text: 'orchestrator history' }] },
    });
    expect(await nextEventOf(events)).toEqual({
      eventName: 'conversation-history',
      data:      { role: 'product-owner', trackerId: TRACKER_ID, messages: [{ at: EXAMPLE_INSTANT.toISOString(), role: 'assistant', text: 'product-owner history' }] },
    });
    expect(conversationServer.openStreamCount()).toBe(1);
    expect(listenerCount()).toBe(2);

    sendMessage('product-owner', 'live reply');
    expect(await nextEventOf(events)).toEqual({
      eventName: 'conversation-message',
      data:      { role: 'product-owner', trackerId: TRACKER_ID, message: { at: EXAMPLE_INSTANT.toISOString(), role: 'assistant', text: 'live reply' } },
    });
  } finally {
    abort.abort();
  }
});

test('a client that goes releases its stream and every conversation it subscribed', async () => {
  const { conversationServer, listenerCount } = await startConversationServer();
  const abort = new AbortController();
  const events = serverSentEventsOf(await fetch(`${conversationServer.url}/api/events?orchestrator=${TRACKER_ID}`, { signal: abort.signal }));
  await nextEventOf(events);
  expect(conversationServer.openStreamCount()).toBe(1);
  expect(listenerCount()).toBe(1);

  abort.abort();
  await waitUntil(() => conversationServer.openStreamCount() === 0 && listenerCount() === 0, 'the server released the stream');
});

test('a stream asking for a conversation from a foreign Origin is refused before it opens', async () => {
  const { conversationServer } = await startConversationServer();
  const response = await fetch(`${conversationServer.url}/api/events?orchestrator=${TRACKER_ID}`, { headers: { Origin: 'http://evil.example' } });
  expect(response.status).toBe(403);
  expect(conversationServer.openStreamCount()).toBe(0);
});

test('shutdown needs POST, the header and no foreign origin, then answers 202 and stops', async () => {
  const extraServer = startedOrThrow(await startDashboardServer(serverOptions));
  extraServers.push(extraServer);
  const shutdownHeader = { 'X-Agent-Dashboard-Shutdown': '1' };

  expect((await sendRawHttpRequest({
    port: extraServer.port, method: 'GET', target: '/api/shutdown', headers: shutdownHeader
  })).status).toBe(405);
  expect((await sendRawHttpRequest({ port: extraServer.port, method: 'POST', target: '/api/shutdown' })).status).toBe(403);
  expect((await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/shutdown',
    headers: { ...shutdownHeader, Origin: 'http://evil.example' },
  })).status).toBe(403);
  expect((await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/shutdown',
    headers: { ...shutdownHeader, Origin: `http://localhost:${extraServer.port + 1}` },
  })).status).toBe(403);

  const accepted = await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/shutdown',
    headers: { ...shutdownHeader, Origin: extraServer.url },
  });
  expect(accepted.status).toBe(202);
  await extraServer.stopped;
  await expect(fetch(`${extraServer.url}/api/identity`)).rejects.toThrow();
});

test('restart needs POST, its header and no foreign origin, then answers 202, stops and reads as a restart', async () => {
  const extraServer = startedOrThrow(await startDashboardServer(serverOptions));
  extraServers.push(extraServer);
  const restartHeader = { 'X-Agent-Dashboard-Restart': '1' };

  expect((await sendRawHttpRequest({
    port: extraServer.port, method: 'GET', target: '/api/restart', headers: restartHeader
  })).status).toBe(405);
  expect((await sendRawHttpRequest({ port: extraServer.port, method: 'POST', target: '/api/restart' })).status).toBe(403);
  expect((await sendRawHttpRequest({
    port: extraServer.port, method: 'POST', target: '/api/restart', headers: { 'X-Agent-Dashboard-Shutdown': '1' }
  })).status).toBe(403);
  expect((await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/restart',
    headers: { ...restartHeader, Origin: 'http://evil.example' },
  })).status).toBe(403);
  expect((await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/restart',
    headers: { ...restartHeader, Origin: `http://localhost:${extraServer.port + 1}` },
  })).status).toBe(403);
  expect(extraServer.isRestartRequested()).toBe(false);

  const accepted = await sendRawHttpRequest({
    port:    extraServer.port,
    method:  'POST',
    target:  '/api/restart',
    headers: { ...restartHeader, Origin: extraServer.url },
  });
  expect(accepted.status).toBe(202);
  await extraServer.stopped;
  expect(extraServer.isRestartRequested()).toBe(true);
  await expect(fetch(`${extraServer.url}/api/identity`)).rejects.toThrow();
});

test('a port something else holds is reported as in use, not thrown', async () => {
  const { holder, heldPort } = await holdPortWithFreePortBelow();
  try {
    expect(await startDashboardServer({ ...serverOptions, port: heldPort })).toEqual({ kind: 'port-in-use', port: heldPort, role: 'dashboard' });
    // The port below the held one was probed free, so the dashboard binds it and meets the held one as its board port.
    expect(await startDashboardServer({ ...serverOptions, port: heldPort - 1 })).toEqual({ kind: 'port-in-use', port: heldPort, role: 'board' });
    expect(await portAccepts(heldPort - 1)).toBe(false);
  } finally {
    holder.close();
  }
});

async function holdPortWithFreePortBelow(): Promise<{ holder: Server; heldPort: number }> {
  const maximumAttempts = 20;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const holder = await listenOn(0);
    if (holder !== undefined) {
      const address = holder.address();
      const heldPort = typeof address === 'object' && address !== null ? address.port : 0;
      const probe = await listenOn(heldPort - 1);
      if (probe !== undefined) {
        await new Promise<void>((resolve) => probe.close(() => { resolve(); }));
        return { holder, heldPort };
      }
      holder.close();
    }
  }
  throw new Error(`no free port pair found in ${String(maximumAttempts)} attempts`);
}

function listenOn(port: number): Promise<Server | undefined> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => { resolve(undefined); });
    server.listen(port, '127.0.0.1', () => { resolve(server); });
  });
}

function portAccepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    void Bun.connect({
      hostname: '127.0.0.1',
      port,
      socket:   {
        open:         (socket) => { socket.end(); resolve(true); },
        data:         () => {},
        connectError: () => resolve(false),
      },
    }).catch(() => resolve(false));
  });
}

// Another process, since that is how a second dashboard meets the first; Bun's default without development mode shares the port.
test('a second dashboard in another process on the first one\'s port is in use, never a second listener', () => {
  const childScript = [
    `import { startDashboardServer } from ${JSON.stringify(join(import.meta.dir, 'DashboardServer.ts'))};`,
    'const start = await startDashboardServer({',
    `  port: ${server.port}, homeDirectory: ${JSON.stringify(serverOptions.homeDirectory)}, agentProgressExecutable: null,`,
    `  dashboardDirectory: ${JSON.stringify(DASHBOARD_DIRECTORY)},`,
    `  runtimeExecutablePath: process.execPath, version: 'example', clock: () => new Date(${EXAMPLE_INSTANT.getTime()}),`,
    `  machineParallelAgentLimit: ${EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT},`,
    '});',
    'if (start.kind === \'started\') await start.server.stop();',
    'process.stdout.write(start.kind);',
    'process.exit(0);',
  ].join('\n');
  const child = Bun.spawnSync([process.execPath, '-e', childScript], { cwd: scratchDirectory, stdout: 'pipe', stderr: 'pipe' });
  expect(child.stderr.toString()).toBe('');
  expect(child.stdout.toString()).toBe('port-in-use');
});

test('the start resolves while the first board read still runs, and the snapshot waits for that read', async () => {
  const releasePath = join(scratchDirectory, 'release-first-read');
  const extraServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutablePrintingOnceReleased(scratchDirectory, statusDocumentPath(), releasePath),
  }));
  extraServers.push(extraServer);
  expect((await fetch(`${extraServer.url}/api/identity`)).status).toBe(200);

  const pendingSnapshot = fetch(`${extraServer.url}/api/snapshot`).then(async (response) => await response.json() as DashboardSnapshot);
  writeFileSync(releasePath, '');
  const snapshot = await pendingSnapshot;
  expect(snapshot.projects.map((project) => [project.trackerId, project.health.kind])).toEqual([[TRACKER_ID, 'ready']]);
});

interface CallLoggingServer {
  server:      RunningDashboardServer;
  callLogPath: string;
}

async function startConcurrencyServer(name: string): Promise<CallLoggingServer> {
  const limitPath = join(scratchDirectory, `${name}-limit`);
  const callLogPath = join(scratchDirectory, `${name}-calls`);
  rmSync(limitPath, { force: true });
  rmSync(callLogPath, { force: true });
  const concurrencyServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableKeepingAConcurrencyLimit(scratchDirectory, statusDocumentPath(), limitPath, callLogPath),
  }));
  extraServers.push(concurrencyServer);
  return { server: concurrencyServer, callLogPath };
}

function callsLogged(callLogPath: string): string[] {
  return existsSync(callLogPath) ? readFileSync(callLogPath, 'utf8').split('\n').filter((line) => line.length > 0) : [];
}

function concurrencyRequest(runningServer: RunningDashboardServer, body: string, headers: Record<string, string> = {}, trackerId = TRACKER_ID): Promise<Response> {
  return fetch(`${runningServer.url}/api/projects/${trackerId}/concurrency`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function concurrencyLimitOf(snapshot: DashboardSnapshot): number | null {
  const health = snapshot.projects[0]?.health;
  return health?.kind === 'ready' ? health.board.concurrencyLimit : null;
}

/** Yields each snapshot event of an open stream, in order. */
async function* snapshotEventsOf(response: Response): AsyncGenerator<DashboardSnapshot> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('the event stream has no body');
  const decoder = new TextDecoder();
  let received = '';
  for (;;) {
    let separator = received.indexOf('\n\n');
    while (separator !== -1) {
      const event = received.slice(0, separator);
      received = received.slice(separator + 2);
      const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
      if (dataLine !== undefined) yield JSON.parse(dataLine.slice('data: '.length)) as DashboardSnapshot;
      separator = received.indexOf('\n\n');
    }
    const { value, done } = await reader.read();
    if (done) return;
    received += decoder.decode(value, { stream: true });
  }
}

test('a concurrency POST runs agent-progress concurrency in the project root, answers 204, and the next snapshot carries the new limit', async () => {
  const { server: concurrencyServer, callLogPath } = await startConcurrencyServer('concurrency-set');
  const abort = new AbortController();
  const events = snapshotEventsOf(await fetch(`${concurrencyServer.url}/api/events`, { signal: abort.signal }));
  try {
    const first = await events.next();
    expect(first.done).toBe(false);
    expect(first.value === undefined ? null : concurrencyLimitOf(first.value)).toBe(2);

    const answer = await concurrencyRequest(concurrencyServer, JSON.stringify({ limit: 5 }), { Origin: concurrencyServer.url });
    expect(answer.status).toBe(204);
    expect(callsLogged(callLogPath)).toEqual([`concurrency 5 in ${realpathSync(projectRoot)}`]);

    const next = await events.next();
    expect(next.value === undefined ? null : concurrencyLimitOf(next.value)).toBe(5);
    expect(concurrencyLimitOf(await (await fetch(`${concurrencyServer.url}/api/snapshot`)).json() as DashboardSnapshot)).toBe(5);
  } finally {
    abort.abort();
  }
});

test('a concurrency POST with a foreign Origin is refused 403 and never runs the CLI', async () => {
  const { server: concurrencyServer, callLogPath } = await startConcurrencyServer('concurrency-origin');
  for (const origin of ['http://evil.example', `http://localhost:${concurrencyServer.port + 1}`, 'null']) {
    expect((await concurrencyRequest(concurrencyServer, JSON.stringify({ limit: 3 }), { Origin: origin })).status, origin).toBe(403);
  }
  expect(callsLogged(callLogPath)).toEqual([]);
  expect((await concurrencyRequest(concurrencyServer, JSON.stringify({ limit: 3 }))).status).toBe(204);
});

test('a limit that is not a whole number from 1 to 10 is refused 400 and never runs the CLI', async () => {
  const { server: concurrencyServer, callLogPath } = await startConcurrencyServer('concurrency-bounds');
  const badBodies = [
    JSON.stringify({ limit: 0 }),
    JSON.stringify({ limit: 11 }),
    JSON.stringify({ limit: -1 }),
    JSON.stringify({ limit: 2.5 }),
    JSON.stringify({ limit: '3' }),
    JSON.stringify({ delta: 1 }),
    JSON.stringify([3]),
    'null',
    'not json',
    '',
  ];
  for (const body of badBodies) expect((await concurrencyRequest(concurrencyServer, body)).status, body).toBe(400);
  expect(callsLogged(callLogPath)).toEqual([]);
});

test('an unknown tracker is 404 and a method other than POST is 405, neither running the CLI', async () => {
  const { server: concurrencyServer, callLogPath } = await startConcurrencyServer('concurrency-unknown');
  expect((await concurrencyRequest(concurrencyServer, JSON.stringify({ limit: 3 }), {}, 'tracker-unknown')).status).toBe(404);
  expect((await concurrencyRequest(concurrencyServer, JSON.stringify({ limit: 3 }), {}, '%')).status).toBe(404);
  const getAnswer = await fetch(`${concurrencyServer.url}/api/projects/${TRACKER_ID}/concurrency`);
  expect(getAnswer.status).toBe(405);
  expect(getAnswer.headers.get('allow')).toBe('POST');
  expect(callsLogged(callLogPath)).toEqual([]);
});

test('a CLI exit 1 answers 409 with the CLI\'s message, and any other failure answers 502', async () => {
  const refusingServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableFailing(scratchDirectory, 'Example refusal from the CLI.\n  Usage: example\n', 1),
  }));
  extraServers.push(refusingServer);
  const refused = await concurrencyRequest(refusingServer, JSON.stringify({ limit: 4 }));
  expect(refused.status).toBe(409);
  expect(await refused.text()).toBe('Example refusal from the CLI.');

  const failingServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableFailing(scratchDirectory, 'Example crash', 3),
  }));
  extraServers.push(failingServer);
  const failed = await concurrencyRequest(failingServer, JSON.stringify({ limit: 4 }));
  expect(failed.status).toBe(502);
  expect(await failed.text()).toContain('exited with code 3');

  const missingServer = startedOrThrow(await startDashboardServer({ ...serverOptions, agentProgressExecutable: null }));
  extraServers.push(missingServer);
  const missing = await concurrencyRequest(missingServer, JSON.stringify({ limit: 4 }));
  expect(missing.status).toBe(502);
  expect(await missing.text()).toBe('agent-progress is not on PATH');
  expect((await fetch(`${missingServer.url}/api/identity`)).status).toBe(200);
});

async function waitUntilProjectCountIs(runningServer: RunningDashboardServer, expectedCount: number): Promise<void> {
  for (const deadline = performance.now() + 5_000; performance.now() < deadline;) {
    const projectCount = (await (await fetch(`${runningServer.url}/api/snapshot`)).json() as DashboardSnapshot).projects.length;
    if (projectCount === expectedCount) return;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting until the snapshot holds ${expectedCount} projects`);
}

test('a project unregistered while its concurrency body is still arriving is 404 and never reaches the CLI', async () => {
  const homeDirectory = join(scratchDirectory, 'unregistering-home');
  mkdirSync(homeDirectory);
  writeExampleRegistry(homeDirectory, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const callLogPath = join(scratchDirectory, 'unregistering-calls');
  const unregisteringServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    homeDirectory,
    agentProgressExecutable: fakeExecutableKeepingAConcurrencyLimit(scratchDirectory, statusDocumentPath(), join(scratchDirectory, 'unregistering-limit'), callLogPath),
  }));
  extraServers.push(unregisteringServer);
  await waitUntilProjectCountIs(unregisteringServer, 1);

  let finishBody = (): void => undefined;
  const bodyFinished = new Promise<void>((resolve) => { finishBody = resolve; });
  const encoder = new TextEncoder();
  const slowBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('{ "limit"'));
      await bodyFinished;
      controller.enqueue(encoder.encode(': 3 }'));
      controller.close();
    },
  });
  const answer = fetch(`${unregisteringServer.url}/api/projects/${TRACKER_ID}/concurrency`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    slowBody,
  });
  writeExampleRegistry(homeDirectory, {});
  await waitUntilProjectCountIs(unregisteringServer, 0);
  finishBody();

  expect((await answer).status).toBe(404);
  expect(callsLogged(callLogPath)).toEqual([]);
});

async function startDispatcherServer(name: string): Promise<CallLoggingServer> {
  const statePath = join(scratchDirectory, `${name}-state`);
  const callLogPath = join(scratchDirectory, `${name}-calls`);
  rmSync(statePath, { force: true });
  rmSync(callLogPath, { force: true });
  const dispatcherServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableKeepingADispatcherState(scratchDirectory, statusDocumentPath(), statePath, callLogPath),
  }));
  extraServers.push(dispatcherServer);
  return { server: dispatcherServer, callLogPath };
}

function dispatcherRequest(runningServer: RunningDashboardServer, body: string, headers: Record<string, string> = {}, trackerId = TRACKER_ID): Promise<Response> {
  return fetch(`${runningServer.url}/api/projects/${trackerId}/dispatcher`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function dispatcherStateOf(snapshot: DashboardSnapshot): string | null {
  const health = snapshot.projects[0]?.health;
  return health?.kind === 'ready' ? health.board.dispatcherState : null;
}

const DISPATCHER_STOP_BODY = JSON.stringify({ state: 'stopped' });

test('a dispatcher stop POST runs agent-progress dispatcher stopped in the project root, answers 204, and the next snapshot shows it stopped', async () => {
  const { server: dispatcherServer, callLogPath } = await startDispatcherServer('dispatcher-stop');
  const abort = new AbortController();
  const events = snapshotEventsOf(await fetch(`${dispatcherServer.url}/api/events`, { signal: abort.signal }));
  try {
    const first = await events.next();
    expect(first.value === undefined ? null : dispatcherStateOf(first.value)).toBe('running');

    const answer = await dispatcherRequest(dispatcherServer, DISPATCHER_STOP_BODY, { Origin: dispatcherServer.url });
    expect(answer.status).toBe(204);
    expect(callsLogged(callLogPath)).toEqual([`dispatcher stopped in ${realpathSync(projectRoot)}`]);

    const next = await events.next();
    expect(next.value === undefined ? null : dispatcherStateOf(next.value)).toBe('stopped');
  } finally {
    abort.abort();
  }
});

test('a dispatcher POST with a foreign Origin is 403, an unknown tracker 404 and a GET 405, none running the CLI', async () => {
  const { server: dispatcherServer, callLogPath } = await startDispatcherServer('dispatcher-guards');
  for (const origin of ['http://evil.example', `http://localhost:${dispatcherServer.port + 1}`, 'null']) {
    expect((await dispatcherRequest(dispatcherServer, DISPATCHER_STOP_BODY, { Origin: origin })).status, origin).toBe(403);
  }
  expect((await dispatcherRequest(dispatcherServer, DISPATCHER_STOP_BODY, {}, 'tracker-unknown')).status).toBe(404);
  expect((await dispatcherRequest(dispatcherServer, DISPATCHER_STOP_BODY, {}, '%')).status).toBe(404);
  const getAnswer = await fetch(`${dispatcherServer.url}/api/projects/${TRACKER_ID}/dispatcher`);
  expect(getAnswer.status).toBe(405);
  expect(getAnswer.headers.get('allow')).toBe('POST');
  expect(callsLogged(callLogPath)).toEqual([]);
});

test('any body but { "state": "stopped" } is refused 400 and never runs the CLI', async () => {
  const { server: dispatcherServer, callLogPath } = await startDispatcherServer('dispatcher-bodies');
  const badBodies = [
    JSON.stringify({ state: 'running' }),
    JSON.stringify({ state: 'finished' }),
    JSON.stringify({ state: 'STOPPED' }),
    JSON.stringify({ state: 'stopped', run: 'example-run' }),
    JSON.stringify({ limit: 3 }),
    JSON.stringify(['stopped']),
    JSON.stringify('stopped'),
    'null',
    'not json',
    '',
  ];
  for (const body of badBodies) expect((await dispatcherRequest(dispatcherServer, body)).status, body).toBe(400);
  expect(callsLogged(callLogPath)).toEqual([]);
});

test('a dispatcher stop the CLI refuses answers 409 with its message, and any other failure answers 502', async () => {
  const refusingServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableFailing(scratchDirectory, 'Example refusal to stop.\n  Usage: example\n', 1),
  }));
  extraServers.push(refusingServer);
  const refused = await dispatcherRequest(refusingServer, DISPATCHER_STOP_BODY);
  expect(refused.status).toBe(409);
  expect(await refused.text()).toBe('Example refusal to stop.');

  const failingServer = startedOrThrow(await startDashboardServer({
    ...serverOptions,
    agentProgressExecutable: fakeExecutableFailing(scratchDirectory, 'Example crash', 3),
  }));
  extraServers.push(failingServer);
  const failed = await dispatcherRequest(failingServer, DISPATCHER_STOP_BODY);
  expect(failed.status).toBe(502);
  expect(await failed.text()).toBe('agent-progress dispatcher exited with code 3: Example crash');
});

const ORCHESTRATOR_RUN_ID = 'example-run-9';

interface OrchestratorFixture {
  server:        RunningDashboardServer;
  homeDirectory: string;
}

/** The captured board plus two low-priority waiting tickets and a dispatcher run id, behind its own fake CLI. */
function orchestratorStatusExecutable(dispatcherRunId: string | null): string {
  const fakeDirectory = join(scratchDirectory, `orchestrator-fake-${dispatcherRunId ?? 'without-run'}`);
  mkdirSync(fakeDirectory, { recursive: true });
  const document = JSON.parse(readFileSync(statusDocumentPath(), 'utf8')) as { concurrency: Record<string, unknown>; tickets: unknown[] };
  document.concurrency['dispatcherRunId'] = dispatcherRunId;
  document.tickets.push(
    {
      id: '012', title: 'Example low chore', status: 'pending', priority: 'low'
    },
    {
      id: '014', title: 'Example other low chore', status: 'pending', priority: 'low'
    },
  );
  const documentPath = join(fakeDirectory, 'status.json');
  writeFileSync(documentPath, JSON.stringify(document));
  return fakeExecutablePrinting(fakeDirectory, documentPath);
}

async function startOrchestratorServer(name: string, dispatcherRunId: string | null = ORCHESTRATOR_RUN_ID): Promise<OrchestratorFixture> {
  const homeDirectory = join(scratchDirectory, `${name}-home`);
  mkdirSync(homeDirectory);
  writeExampleRegistry(homeDirectory, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const agentProgressExecutable = orchestratorStatusExecutable(dispatcherRunId);
  const orchestratorServer = startedOrThrow(await startDashboardServer({ ...serverOptions, homeDirectory, agentProgressExecutable }));
  extraServers.push(orchestratorServer);
  return { server: orchestratorServer, homeDirectory };
}

/** Sockets live in a scratch folder of their own, short enough for macOS's 104-byte socket path limit. */
function liveExampleSession(fixture: OrchestratorFixture, sessionId: string, socketDirectory: string, pid = process.pid): ExampleSessionListener {
  const listener = listenAsExampleSession(socketDirectory, sessionId);
  writeExampleSessionRecord(fixture.homeDirectory, {
    pid, sessionId, cwd: projectRoot, messagingSocketPath: listener.socketPath
  });
  return listener;
}

function liveRunHolder(fixture: OrchestratorFixture, sessionId: string, socketDirectory: string, pid = process.pid): ExampleSessionListener {
  const listener = liveExampleSession(fixture, sessionId, socketDirectory, pid);
  createExampleWorkflowRun(fixture.homeDirectory, {
    pid, sessionId, cwd: projectRoot, messagingSocketPath: listener.socketPath
  }, ORCHESTRATOR_RUN_ID);
  return listener;
}

function orchestratorRequest(runningServer: RunningDashboardServer, body: string, headers: Record<string, string> = {}, trackerId = TRACKER_ID): Promise<Response> {
  return fetch(`${runningServer.url}/api/projects/${trackerId}/orchestrator-requests`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

function withSocketDirectory(work: (socketDirectory: string, listeners: ExampleSessionListener[]) => Promise<void>): Promise<void> {
  const socketDirectory = createScratchDirectory('sock');
  const listeners: ExampleSessionListener[] = [];
  return work(socketDirectory, listeners).finally(() => {
    for (const listener of listeners) listener.stop();
    removeScratchDirectory(socketDirectory);
  });
}

test('start-building writes one line asking for confirmation to the desktop session holding the run', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('orchestrator-start');
  const orchestrator = liveExampleSession(fixture, 'a', socketDirectory);
  listeners.push(orchestrator);
  createExampleWorkflowRun(fixture.homeDirectory, {
    pid: process.pid, sessionId: 'a', cwd: projectRoot, messagingSocketPath: orchestrator.socketPath
  }, ORCHESTRATOR_RUN_ID);

  const answer = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'start-building' }), { Origin: fixture.server.url });
  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ recipient: 'desktop-session' });
  await waitUntil(() => orchestrator.receivedText().endsWith('\n'), 'the session receives the line');
  const expectedText = orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'desktop-session');
  expect(expectedText).toContain('ask your user to confirm');
  expect(orchestrator.receivedText()).toBe(`${JSON.stringify({ type: 'user', message: { role: 'user', content: expectedText } })}\n`);
}));

test('a live dashboard-owned session gets the request as its chat with no confirm request, naming that delivery', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const homeDirectory = join(scratchDirectory, 'orchestrator-owned-home');
  mkdirSync(homeDirectory);
  writeExampleRegistry(homeDirectory, { [TRACKER_ID]: exampleRegistryEntry(projectRoot, 'example-storefront') });
  const ownedOptions = { ...serverOptions, homeDirectory };
  const desktopSession = liveExampleSession({ server, homeDirectory }, 'h', socketDirectory);
  listeners.push(desktopSession);
  const chattedTexts: string[] = [];
  const realSessions = createDashboardOrchestratorSessions(ownedOptions);
  const ownedServer = startedOrThrow(await serveDashboard(ownedOptions, {
    monitor: createProjectMonitor({
      homeDirectory,
      readBoardStatus:              () => Promise.resolve({ kind: 'unreadable', reason: 'Example' }),
      clock:                        () => EXAMPLE_INSTANT,
      quietMilliseconds:            SHORT_HEARTBEAT_MILLISECONDS,
      maximumWaitMilliseconds:      60_000,
      sweepIntervalMilliseconds:    60_000,
      maximumConcurrentStatusReads: 1,
      machineParallelAgentLimit:    EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
    }),
    orchestratorSessions: {
      ...realSessions,
      isLive: (trackerId) => trackerId === TRACKER_ID,
      chat(_trackerId, text) {
        chattedTexts.push(text);
        return Promise.resolve({ kind: 'delivered' });
      },
    },
    productOwnerSessions:            createDashboardOrchestratorSessions(ownedOptions, {}, 'product-owner'),
    heartbeatIntervalMilliseconds:   SHORT_HEARTBEAT_MILLISECONDS,
    handoffReplyTimeoutMilliseconds: SHORT_HEARTBEAT_MILLISECONDS,
  }));
  extraServers.push(ownedServer);

  const answer = await orchestratorRequest(ownedServer, JSON.stringify({ kind: 'start-building' }), { Origin: ownedServer.url });
  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ recipient: 'dashboard-session' });
  expect(chattedTexts).toEqual([orchestratorMessageTextOf({ kind: 'start-building' }, 'example-storefront', 'dashboard-session')]);
  expect(chattedTexts[0]).not.toContain('confirm');
  expect(desktopSession.connectionCount()).toBe(0);
}));

test('a clear-low-tickets request names every id; an id not low-priority waiting is 409 with no write', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('orchestrator-clear');
  const orchestrator = liveExampleSession(fixture, 'b', socketDirectory);
  listeners.push(orchestrator);

  const refused = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'clear-low-tickets', ticketIds: ['012', '005'] }));
  expect(refused.status).toBe(409);
  expect(await refused.text()).toContain('005');
  expect(orchestrator.connectionCount()).toBe(0);

  const answer = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'clear-low-tickets', ticketIds: ['012', '014'] }));
  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ recipient: 'desktop-session' });
  await waitUntil(() => orchestrator.receivedText().endsWith('\n'), 'the session receives the line');
  const received = JSON.parse(orchestrator.receivedText()) as { message: { content: string } };
  expect(received.message.content).toContain('#012, #014');
  expect(received.message.content).toContain('includeLowPriority: true');
  expect(received.message.content).toContain('ask your user to confirm');
}));

test('a malformed orchestrator request is 400 and nothing is written', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('orchestrator-malformed');
  const orchestrator = liveExampleSession(fixture, 'c', socketDirectory);
  listeners.push(orchestrator);
  const badBodies = [
    JSON.stringify({ kind: 'stop-building' }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: [] }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: [12] }),
    JSON.stringify({ kind: 'clear-low-tickets', ticketIds: Array.from({ length: 51 }, () => '012') }),
    'not json',
  ];
  for (const body of badBodies) expect((await orchestratorRequest(fixture.server, body)).status, body).toBe(400);
  expect(orchestrator.connectionCount()).toBe(0);
}));

test('two live sessions in the root and no run match answer 409 naming that, and neither receives anything', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('orchestrator-several');
  const first = liveExampleSession(fixture, 'd', socketDirectory);
  const second = liveExampleSession(fixture, 'e', socketDirectory, process.ppid);
  listeners.push(first, second);
  const answer = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'start-building' }));
  expect(answer.status).toBe(409);
  expect(await answer.text()).toContain('Several live Claude Code sessions');
  await Bun.sleep(50);
  expect(first.receivedText() + second.receivedText()).toBe('');
}));

test('no orchestrator session answers 409 naming that', async () => {
  const fixture = await startOrchestratorServer('orchestrator-none');
  const answer = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'start-building' }));
  expect(answer.status).toBe(409);
  expect(await answer.text()).toContain('No live Claude Code session');
});

test('the orchestrator route keeps the concurrency guards: Host and Origin 403, unknown tracker 404, GET 405', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('orchestrator-guards');
  const orchestrator = liveExampleSession(fixture, 'f', socketDirectory);
  listeners.push(orchestrator);
  const body = JSON.stringify({ kind: 'start-building' });
  for (const origin of ['http://evil.example', 'null']) expect((await orchestratorRequest(fixture.server, body, { Origin: origin })).status, origin).toBe(403);
  expect((await orchestratorRequest(fixture.server, body, {}, 'tracker-unknown')).status).toBe(404);
  const getAnswer = await fetch(`${fixture.server.url}/api/projects/${TRACKER_ID}/orchestrator-requests`);
  expect(getAnswer.status).toBe(405);
  expect(getAnswer.headers.get('allow')).toBe('POST');
  const foreignHost = await sendRawHttpRequest({
    port: fixture.server.port, method: 'POST', target: `/api/projects/${TRACKER_ID}/orchestrator-requests`, headers: { Host: 'evil.example' }
  });
  expect(foreignHost.status).toBe(403);
  expect(orchestrator.connectionCount()).toBe(0);
}));

test('a socket that fails after its session was chosen answers 502', () => withSocketDirectory(async (socketDirectory) => {
  const fixture = await startOrchestratorServer('orchestrator-failing');
  const socketPath = join(socketDirectory, 'g.sock');
  const acceptingOnlyTheProbe = Bun.listen({
    unix:   socketPath,
    socket: {
      open() {
        acceptingOnlyTheProbe.stop(true);
      },
      data() {},
    },
  });
  writeExampleSessionRecord(fixture.homeDirectory, {
    pid: process.pid, sessionId: 'g', cwd: projectRoot, messagingSocketPath: socketPath
  });
  const answer = await orchestratorRequest(fixture.server, JSON.stringify({ kind: 'start-building' }));
  expect(answer.status).toBe(502);
}));

async function watchedChatRequest(runningServer: RunningDashboardServer, body: string, headers: Record<string, string> = {}): Promise<Response> {
  const launchToken = (await (await fetch(`${runningServer.url}${DASHBOARD_PROTOCOL.LAUNCH_TOKEN_PATH}`)).json() as LaunchToken).token;
  return fetch(`${runningServer.url}/api/projects/${TRACKER_ID}/orchestrator/messages`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json', 'Origin': runningServer.url, [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: launchToken, ...headers
    },
    body,
  });
}

test('the snapshot lists only the live sessions holding the run as watched, with name, status and usage', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('watched-snapshot');
  const named = liveRunHolder(fixture, 'h', socketDirectory);
  listeners.push(named);
  writeExampleSessionRecord(fixture.homeDirectory, {
    pid: process.pid, sessionId: 'h', cwd: projectRoot, messagingSocketPath: named.socketPath
  }, { name: 'Example orchestrator', status: 'busy' });
  writeExampleTranscript(fixture.homeDirectory, {
    pid: process.pid, sessionId: 'h', cwd: projectRoot, messagingSocketPath: named.socketPath
  }, [exampleAssistantLine('claude-example-1', { input_tokens: 5, cache_read_input_tokens: 50 }, '2026-10-22T10:01:00.000Z')]);
  const unmeasured = liveRunHolder(fixture, 'i', socketDirectory, process.ppid);
  const ordinary = liveExampleSession(fixture, 'h-ordinary', socketDirectory);
  listeners.push(unmeasured, ordinary);

  const snapshot = await (await fetch(`${fixture.server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshot.watchedOrchestratorsByTracker).toEqual({
    [TRACKER_ID]: [
      {
        ownership: 'watched',
        sessionId: 'h',
        pid:       process.pid,
        name:      'Example orchestrator',
        state:     'busy',
        startedAt: EXAMPLE_SESSION_STARTED_AT,
        context:   {
          usedTokens: 55, contextWindowTokens: null, model: 'claude-example-1', measuredAt: '2026-10-22T10:01:00.000Z'
        },
        pendingQuestions:  [],
        lastAction:        null,
        previousSessionId: null,
      },
      {
        ownership:         'watched',
        sessionId:         'i',
        pid:               process.ppid,
        name:              null,
        state:             'idle',
        startedAt:         EXAMPLE_SESSION_STARTED_AT,
        context:           null,
        pendingQuestions:  [],
        lastAction:        null,
        previousSessionId: null,
      },
    ],
  });
  expect(snapshot.projects[0]?.orchestrator).toBeNull();
  expect(named.connectionCount() + unmeasured.connectionCount() + ordinary.connectionCount()).toBe(0);
}));

test('of two live sessions in the root only the run holder is watched, and without a run neither is', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('watched-one-holder');
  listeners.push(liveRunHolder(fixture, 'o', socketDirectory), liveExampleSession(fixture, 'p', socketDirectory, process.ppid));
  const snapshot = await (await fetch(`${fixture.server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshot.watchedOrchestratorsByTracker[TRACKER_ID]?.map((session) => session.sessionId)).toEqual(['o']);

  const fixtureWithoutRun = await startOrchestratorServer('watched-without-run', null);
  listeners.push(liveRunHolder(fixtureWithoutRun, 'q', socketDirectory), liveExampleSession(fixtureWithoutRun, 'r', socketDirectory, process.ppid));
  const snapshotWithoutRun = await (await fetch(`${fixtureWithoutRun.server.url}/api/snapshot`)).json() as DashboardSnapshot;
  expect(snapshotWithoutRun.watchedOrchestratorsByTracker).toEqual({ [TRACKER_ID]: [] });
}));

test('a chat naming a watched session writes one user line to its socket alone, beside another in the root', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('watched-chat');
  const chosen = liveRunHolder(fixture, 'j', socketDirectory);
  const other = liveRunHolder(fixture, 'k', socketDirectory, process.ppid);
  listeners.push(chosen, other);

  const answer = await watchedChatRequest(fixture.server, JSON.stringify({ text: '  Example question?  ', sessionId: 'j' }));
  expect(answer.status).toBe(204);
  await waitUntil(() => chosen.receivedText().endsWith('\n'), 'the watched session receives the line');
  expect(chosen.receivedText()).toBe(`${JSON.stringify({ type: 'user', message: { role: 'user', content: 'Example question?' } })}\n`);
  expect(other.connectionCount()).toBe(0);
}));

test('a chat naming a gone or runless session is 409, a malformed one 400, a grantless one 403, none writing', () => withSocketDirectory(async (socketDirectory, listeners) => {
  const fixture = await startOrchestratorServer('watched-refusals');
  const live = liveRunHolder(fixture, 'l', socketDirectory);
  listeners.push(live);
  const gone = liveRunHolder(fixture, 'm', socketDirectory, await exitedProcessId());
  listeners.push(gone);
  const withoutRun = liveExampleSession(fixture, 'n', socketDirectory);
  listeners.push(withoutRun);

  expect((await watchedChatRequest(fixture.server, JSON.stringify({ text: 'Example', sessionId: 'm' }))).status).toBe(409);
  const notWatched = await watchedChatRequest(fixture.server, JSON.stringify({ text: 'Example', sessionId: 'n' }));
  expect(notWatched.status).toBe(409);
  expect(await notWatched.text()).toContain('holds this project\'s dispatcher run');
  expect((await watchedChatRequest(fixture.server, JSON.stringify({ text: 'Example', sessionId: 'no-such-session' }))).status).toBe(409);
  const malformedBodies = [{ text: 'Example', sessionId: 7 }, { text: 'Example', sessionId: '' }, { text: 'Example', sessionId: 'l', extra: true }]
    .map((body) => JSON.stringify(body));
  for (const body of malformedBodies) {
    expect((await watchedChatRequest(fixture.server, body)).status, body).toBe(400);
  }
  const wrongToken = { [DASHBOARD_PROTOCOL.LAUNCH_TOKEN_HEADER_NAME]: 'not-the-token' };
  const withoutToken = await watchedChatRequest(fixture.server, JSON.stringify({ text: 'Example', sessionId: 'l' }), wrongToken);
  expect(withoutToken.status).toBe(403);
  await Bun.sleep(50);
  expect(live.connectionCount() + gone.connectionCount() + withoutRun.connectionCount()).toBe(0);
}));
