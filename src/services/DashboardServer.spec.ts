/**
 * A real server on a free port over a scratch home whose registry names one scratch project, its board read by a fake
 * agent-progress printing a captured status document. The cases are the server's promises: the Host guard on every
 * data route (the app shell, which Bun answers first, holds no data), the page route serving only what lies inside the
 * page folder (planted escapes: `../`, encoded `%2e%2e`, an encoded slash, NUL, a symlink out) with every file but the
 * board page sandboxed, 404s, the event stream opening with a snapshot and releasing its subscription
 * on disconnect, a shutdown only the CLI can ask for, a held port reported, not thrown, a second dashboard never
 * sharing the port, and a start that answers its
 * identity before the first board read ends, since the CLI writes the server record as soon as the start resolves.
 */
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer }                          from 'node:net';
import { join }                                  from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  test
} from 'bun:test';

import { type DashboardSnapshot, type ServerIdentity }                             from '../shared/DashboardContract.ts';
import { createExampleProjectRoot, exampleRegistryEntry, writeExampleRegistry }    from '../testing/ExampleBoards.ts';
import { fakeExecutablePrinting, fakeExecutablePrintingOnceReleased }              from '../testing/FakeAgentProgressExecutable.ts';
import { sendRawHttpRequest }                                                      from '../testing/RawHttpRequest.ts';
import { createScratchDirectory, removeScratchDirectory, requireScratchDirectory } from '../testing/ScratchDirectory.ts';
import {
  type DashboardServerOptions,
  type RunningDashboardServer,
  allowedHostHeadersOf,
  serveDashboard,
  startDashboardServer
} from './DashboardServer.ts';
import { type ProjectMonitor, createProjectMonitor } from './ProjectMonitor.ts';

const TRACKER_ID = 'tracker-storefront';
const EXAMPLE_INSTANT = new Date('2026-10-21T12:00:00.000Z');
const EXAMPLE_VERSION = '0.0.0-example';
const SHORT_HEARTBEAT_MILLISECONDS = 30;

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
    port:                    0,
    homeDirectory,
    agentProgressExecutable: fakeExecutablePrinting(scratchDirectory, statusDocumentPath()),
    runtimeExecutablePath:   process.execPath,
    version:                 EXAMPLE_VERSION,
    clock:                   () => EXAMPLE_INSTANT,
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
  expect(snapshot.projects[0]?.pageUrl).toBe(pageTarget('progress.html'));
});

test('a Host that is not this server\'s own is refused on every data route, and each loopback name is let in', async () => {
  for (const target of ['/api/identity', '/api/snapshot', '/api/events', pageTarget('progress.html'), '/api/shutdown']) {
    for (const host of ['evil.example', `evil.example:${server.port}`, '127.0.0.1:1', '127.0.0.1']) {
      const answer = await sendRawHttpRequest({ port: server.port, target, headers: { Host: host } });
      expect(answer.status, `${host} ${target}`).toBe(403);
    }
  }
  for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`, `[::1]:${server.port}`]) {
    expect((await sendRawHttpRequest({ port: server.port, target: '/api/identity', headers: { Host: host } })).status, host).toBe(200);
  }
});

test('the app shell answers a foreign Host, as Bun serves it before the guard, and carries no board data', async () => {
  const answer = await sendRawHttpRequest({ port: server.port, target: '/', headers: { Host: 'evil.example' } });
  expect(answer.status).toBe(200);
  expect(answer.body).not.toContain(TRACKER_ID);
  expect(answer.body).not.toContain(projectRoot);
});

test('on the default HTTP port the bare loopback names are let in too, since a browser sends no port there', () => {
  expect([...allowedHostHeadersOf(80)].sort()).toEqual(['127.0.0.1', '127.0.0.1:80', '[::1]', '[::1]:80', 'localhost', 'localhost:80']);
  expect([...allowedHostHeadersOf(4710)].sort()).toEqual(['127.0.0.1:4710', '[::1]:4710', 'localhost:4710']);
});

test('the board page and its stamp may reach only this server, and every other page-folder file is sandboxed', async () => {
  for (const target of [pageTarget('progress.html'), pageTarget('progress.stamp.js'), pageTarget('./progress.html')]) {
    const policy = (await sendRawHttpRequest({ port: server.port, target })).headers.get('content-security-policy') ?? '';
    expect(policy, target).toContain('connect-src \'self\'');
    expect(policy, target).toContain('default-src \'self\'');
    expect(policy, target).toContain('frame-ancestors \'self\'');
  }
  for (const target of [pageTarget('example-diagram.svg'), pageTarget('assets/example.css')]) {
    const answer = await sendRawHttpRequest({ port: server.port, target });
    expect(answer.status, target).toBe(200);
    expect(answer.headers.get('content-security-policy'), target).toBe('sandbox');
  }
});

test('a page file is served with its content type and no caching', async () => {
  const page = await sendRawHttpRequest({ port: server.port, target: pageTarget('progress.html') });
  expect(page.status).toBe(200);
  expect(page.headers.get('content-type')).toStartWith('text/html');
  expect(page.headers.get('cache-control')).toBe('no-store');
  expect(page.body).toContain('<title>example-storefront</title>');

  const stylesheet = await sendRawHttpRequest({ port: server.port, target: pageTarget('assets/example.css') });
  expect(stylesheet.headers.get('content-type')).toStartWith('text/css');
  const stamp = await sendRawHttpRequest({ port: server.port, target: pageTarget('progress.stamp.js') });
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
    const answer = await sendRawHttpRequest({ port: server.port, target });
    expect(answer.status, target).toBe(404);
    expect(answer.body, target).not.toContain('secret');
  }
});

test('an unknown tracker, a missing file, a folder and an unknown route are 404', async () => {
  for (const target of ['/projects/tracker-unknown/page/progress.html', pageTarget('absent.html'), pageTarget('assets'), pageTarget(''), '/api/unknown', '/projects']) {
    expect((await sendRawHttpRequest({ port: server.port, target })).status, target).toBe(404);
  }
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
  const extraServer = startedOrThrow(await serveDashboard(serverOptions, { monitor: countingMonitor, heartbeatIntervalMilliseconds: SHORT_HEARTBEAT_MILLISECONDS }));
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

test('a port something else holds is reported as in use, not thrown', async () => {
  const holder = createServer();
  await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
  const address = holder.address();
  const heldPort = typeof address === 'object' && address !== null ? address.port : 0;
  try {
    expect(await startDashboardServer({ ...serverOptions, port: heldPort })).toEqual({ kind: 'port-in-use', port: heldPort });
  } finally {
    holder.close();
  }
});

// Another process, since that is how a second dashboard meets the first; Bun's default without development mode shares the port.
test('a second dashboard in another process on the first one\'s port is in use, never a second listener', () => {
  const childScript = [
    `import { startDashboardServer } from ${JSON.stringify(join(import.meta.dir, 'DashboardServer.ts'))};`,
    'const start = await startDashboardServer({',
    `  port: ${server.port}, homeDirectory: ${JSON.stringify(serverOptions.homeDirectory)}, agentProgressExecutable: null,`,
    `  runtimeExecutablePath: process.execPath, version: 'example', clock: () => new Date(${EXAMPLE_INSTANT.getTime()}),`,
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
