// Runs this checkout's dashboard server over a synthetic machine and photographs it: the animation frames while seed-demo.sh replays
// the morning, then, with a scripted orchestrator and product owner started through the dashboard's own routes, the stills listed
// in <build>/jobs/base.json, writing their element measurements to <build>/measurements.json.
// Usage: bun director.js <build folder> [--keep-machine]
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { launchChrome } from './chrome.js';

const HERE = import.meta.dir;
const CHECKOUT = resolve(HERE, '..');
const STORY_DAY = '2026-09-24';
const STORY_OFFSET = '+02:00';
const FINAL_CLOCK = '13:40';
const STOREFRONT_TRACKER = 'example-storefront';
const VIEWPORT_WIDTH = 1440;
const SNAPSHOT_POLL_MILLISECONDS = 300;
const SNAPSHOT_SETTLE_TIMEOUT_MILLISECONDS = 4_000;
const SESSION_TIMEOUT_MILLISECONDS = 20_000;
const SESSION_STOP_MILLISECONDS = 4_000;
const SERVER_START_TIMEOUT_MILLISECONDS = 10_000;
const LOWEST_PORT = 47_000;
const PORT_RANGE = 2_000;

const [buildArgument, ...options] = process.argv.slice(2);
if (!buildArgument) throw new Error('usage: bun director.js <build folder> [--keep-machine]');
const build = resolve(buildArgument);
const keepMachine = options.includes('--keep-machine');
const frameJobTemplate = JSON.parse(readFileSync(join(build, 'jobs', 'frame.json'), 'utf8'));
const stillJobs = JSON.parse(readFileSync(join(build, 'jobs', 'base.json'), 'utf8'));

// A short path under /tmp: the supervisor's Unix socket lives under the synthetic home, and macOS caps a socket path at 103 bytes.
const machine = realpathSync(mkdtempSync('/tmp/ad.'));
// The machine folder is the home folder itself, so the socket path stays short.
const home = machine;
const storyClockFile = join(machine, 'story-clock');
const storyTimeOf = (clock) => `${STORY_DAY}T${clock}:00${STORY_OFFSET}`;
const setStoryClock = (clock) => writeFileSync(storyClockFile, `${storyTimeOf(clock)}\n`);
/** The story time every preloaded process reads now, as freeze-clock.js computes it. */
function storyNow() {
  const writtenAt = statSync(storyClockFile).mtimeMs;
  const storyMilliseconds = Date.parse(readFileSync(storyClockFile, 'utf8').trim()) + Math.max(0, Date.now() - writtenAt);
  return new Date(storyMilliseconds).toISOString();
}

const storyEnvironment = {
  ...process.env,
  HOME:                        home,
  STORY_CLOCK_FILE:            storyClockFile,
  BUN_OPTIONS:                 `--preload ${join(HERE, 'freeze-clock.js')}`,
  AGENT_DASHBOARD_CLAUDE:      join(HERE, 'demo-claude.js'),
  AGENT_DASHBOARD_NO_BROWSER:  '1',
  TZ:                          'Europe/Amsterdam',
};
delete storyEnvironment.AGENT_PROGRESS_ROOT;

async function portIsFree(port) {
  try {
    const probe = Bun.serve({ port, hostname: '127.0.0.1', fetch: () => new Response('') });
    probe.stop(true);
    return true;
  } catch {
    return false;
  }
}

/** The dashboard serves its board pages one port above its own, so both must be free. */
async function freeDashboardPort() {
  for (let i = 0; i < PORT_RANGE; i += 1) {
    const port = LOWEST_PORT + Math.floor(Math.random() * PORT_RANGE);
    if (await portIsFree(port) && await portIsFree(port + 1)) return port;
  }
  throw new Error('no free port pair for the dashboard');
}

async function snapshot(dashboardUrl) {
  return (await fetch(`${dashboardUrl}/api/snapshot`)).json();
}

async function waitUntil(description, condition, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await Bun.sleep(SNAPSHOT_POLL_MILLISECONDS);
  }
  throw new Error(`timed out waiting for ${description}`);
}

/** Waits until the server has picked up the latest step: its projects unchanged across two polls. */
async function settledProjects(dashboardUrl) {
  const deadline = Date.now() + SNAPSHOT_SETTLE_TIMEOUT_MILLISECONDS;
  let previous = JSON.stringify((await snapshot(dashboardUrl)).projects);
  while (Date.now() < deadline) {
    await Bun.sleep(SNAPSHOT_POLL_MILLISECONDS);
    const current = JSON.stringify((await snapshot(dashboardUrl)).projects);
    if (current === previous) return;
    previous = current;
  }
}

mkdirSync(home, { recursive: true });
setStoryClock('07:29');
const port = await freeDashboardPort();
const dashboardUrl = `http://127.0.0.1:${port}`;
const serverLog = Bun.file(join(build, 'server.log'));
const server = Bun.spawn(['bun', join(CHECKOUT, 'agent-dashboard.ts'), 'serve', '--port', String(port)], {
  cwd: machine, env: storyEnvironment, stdout: serverLog, stderr: serverLog,
});
const chrome = await launchChrome();

async function inPage(expression) {
  return chrome.evaluate(`(async () => { ${expression} })()`);
}

const sessionRequestScript = (method, path, body) => `
  const { token } = await (await fetch('/api/launch-token')).json();
  const response = await fetch('/api/projects/${STOREFRONT_TRACKER}/${path}', {
    method: '${method}', headers: { 'content-type': 'application/json', 'X-Agent-Dashboard-Launch-Token': token },
    ${body === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(body))},`}
  });
  if (!response.ok) throw new Error('${method} ${path}: ' + response.status + ' ' + await response.text());
  return response.status;`;

let frameCount = 0;
const frameServer = Bun.serve({
  port:     0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const storyTime = new URL(request.url).searchParams.get('at');
    if (!storyTime) return new Response('at is required', { status: 400 });
    await settledProjects(dashboardUrl);
    await chrome.capture({ ...frameJobTemplate, url: `${dashboardUrl}/#/`, frozenNow: storyTime, output: join(build, 'hero-frames', `frame-${String(frameCount).padStart(3, '0')}.png`) });
    frameCount += 1;
    return new Response('taken');
  },
});

try {
  await waitUntil('the dashboard server', async () => {
    try {
      return (await fetch(`${dashboardUrl}/api/snapshot`)).ok;
    } catch {
      return false;
    }
  }, SERVER_START_TIMEOUT_MILLISECONDS);

  const seed = Bun.spawn(['bash', join(HERE, 'seed-demo.sh'), machine], {
    env: { ...storyEnvironment, FRAME_URL: `http://127.0.0.1:${frameServer.port}/frame` }, stdout: 'inherit', stderr: 'inherit',
  });
  if (await seed.exited !== 0) throw new Error('seed-demo.sh failed');
  console.log(`took ${frameCount} animation frames`);

  setStoryClock(FINAL_CLOCK);
  await chrome.capture({ ...frameJobTemplate, url: `${dashboardUrl}/#/`, frozenNow: storyNow() });
  await inPage(sessionRequestScript('POST', 'orchestrator', { startBuilding: false }));
  await inPage(sessionRequestScript('POST', 'product-owner', { mode: 'file' }));
  const storefront = async () => (await snapshot(dashboardUrl)).projects.find((project) => project.trackerId === STOREFRONT_TRACKER);
  await waitUntil('both sessions idle', async () => {
    const project = await storefront();
    return project?.orchestrator?.state === 'idle' && project?.productOwner?.state === 'idle' && project.productOwner.lastAction !== null;
  }, SESSION_TIMEOUT_MILLISECONDS);
  await inPage(sessionRequestScript('POST', 'orchestrator/messages', { text: 'What is holding up the checkout redesign?' }));
  await inPage(sessionRequestScript('POST', 'product-owner/messages', { text: 'Customers keep asking us to remember their size. Can you file that?' }));
  await waitUntil('the orchestrator\'s question and the product owner\'s ticket', async () => {
    const project = await storefront();
    return project?.orchestrator?.pendingQuestions?.length === 1 && project?.productOwner?.state === 'idle'
      && (project.productOwner.lastAction?.text ?? '').includes('Filed');
  }, SESSION_TIMEOUT_MILLISECONDS);
  await settledProjects(dashboardUrl);

  const measurements = {};
  for (const job of stillJobs) {
    measurements[job.name] = await chrome.capture({
      ...job, url: `${dashboardUrl}/${job.route}`, frozenNow: storyNow(), localStorageEntries: { 'agent-progress:theme': job.colorScheme },
    });
  }
  writeFileSync(join(build, 'measurements.json'), `${JSON.stringify(measurements, null, 2)}\n`);
  console.log(`took ${stillJobs.filter((job) => job.output).length} stills`);

  await chrome.capture({ ...frameJobTemplate, url: `${dashboardUrl}/#/`, frozenNow: storyNow() });
  await inPage(sessionRequestScript('DELETE', 'orchestrator'));
  await inPage(sessionRequestScript('DELETE', 'product-owner'));
  await Bun.sleep(SESSION_STOP_MILLISECONDS);
} finally {
  frameServer.stop(true);
  await chrome.close();
  server.kill();
  await server.exited;
  // A supervisor names the demo root on its command line; none may outlive the run.
  Bun.spawnSync(['pkill', '-f', machine]);
  if (keepMachine) console.log(`synthetic machine kept at ${machine} (HOME=${home})`);
  else rmSync(machine, { recursive: true, force: true });
}
