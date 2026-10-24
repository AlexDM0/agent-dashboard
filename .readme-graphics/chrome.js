// Headless Chrome over the DevTools protocol, shared by the director (the live dashboard) and shoot.js (the composed panels):
// one browser, one page, and a job runner that sets the viewport, colour scheme and a frozen clock, navigates, runs an optional
// in-page action, measures elements and writes a screenshot.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const STORY_TIME_ZONE = 'Europe/Amsterdam';
const CHROME_CANDIDATES = [
  process.env['CHROME_BINARY'],
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const STARTUP_ATTEMPTS = 150;
const STARTUP_POLL_MILLISECONDS = 100;

function createSession(socket) {
  let nextCommandIdentifier = 1;
  const pendingCommands = new Map();
  let loadWaiters = [];
  socket.addEventListener('message', (messageEvent) => {
    const message = JSON.parse(String(messageEvent.data));
    if (message.id !== undefined) {
      const pending = pendingCommands.get(message.id);
      pendingCommands.delete(message.id);
      if (message.error) pending?.reject(new Error(JSON.stringify(message.error)));
      else pending?.resolve(message.result);
    } else if (message.method === 'Page.loadEventFired') {
      for (const waiter of loadWaiters) waiter();
      loadWaiters = [];
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      console.error('page exception:', details.exception?.description ?? details.text);
    }
  });
  return {
    send(method, parameters = {}) {
      const identifier = nextCommandIdentifier++;
      return new Promise((resolve, reject) => {
        pendingCommands.set(identifier, { resolve, reject });
        socket.send(JSON.stringify({ id: identifier, method, params: parameters }));
      });
    },
    nextLoad() {
      return new Promise((resolve) => loadWaiters.push(resolve));
    },
  };
}

async function debuggingPortOf(userDataDirectory) {
  const portFile = join(userDataDirectory, 'DevToolsActivePort');
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    if (existsSync(portFile)) {
      const port = Number(readFileSync(portFile, 'utf8').split('\n')[0].trim());
      if (port > 0) return port;
    }
    await Bun.sleep(STARTUP_POLL_MILLISECONDS);
  }
  throw new Error('Chrome never wrote DevToolsActivePort');
}

async function pageWebSocketUrlOf(port) {
  for (let attempt = 0; attempt < STARTUP_ATTEMPTS; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const pageTarget = targets.find((target) => target.type === 'page');
      if (pageTarget) return pageTarget.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await Bun.sleep(STARTUP_POLL_MILLISECONDS);
  }
  throw new Error('Chrome exposed no page target');
}

// Runs in every frame, the dashboard's board iframe among them, so the page and the board it embeds read one story time.
function clockFreezingScript(frozenNow) {
  return `(() => {
    const offsetMilliseconds = Date.parse(${JSON.stringify(frozenNow)}) - Date.now();
    const OriginalDate = Date;
    class FrozenDate extends OriginalDate {
      constructor(...values) { if (values.length === 0) super(OriginalDate.now() + offsetMilliseconds); else super(...values); }
      static now() { return OriginalDate.now() + offsetMilliseconds; }
    }
    globalThis.Date = FrozenDate;
  })();`;
}

function storageSeedingScript(entries) {
  return `(() => { try { const entries = ${JSON.stringify(entries)}; for (const key of Object.keys(entries)) localStorage.setItem(key, entries[key]); } catch (error) {} })();`;
}

function rectangleExpression(selector) {
  return `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null;
    const box = element.getBoundingClientRect();
    return { left: box.left + scrollX, top: box.top + scrollY, right: box.right + scrollX, bottom: box.bottom + scrollY }; })()`;
}

export async function launchChrome() {
  const chromeBinary = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!chromeBinary) throw new Error('No Chrome or Chromium found; set CHROME_BINARY');
  const userDataDirectory = mkdtempSync(join(tmpdir(), 'readme-graphics-chrome-'));
  const chromeProcess = Bun.spawn([
    chromeBinary, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-allow-origins=*', '--remote-debugging-port=0', `--user-data-dir=${userDataDirectory}`, 'about:blank',
  ], { stdout: 'pipe', stderr: 'pipe', env: { ...process.env, TZ: STORY_TIME_ZONE } });
  const socket = new WebSocket(await pageWebSocketUrlOf(await debuggingPortOf(userDataDirectory)));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('could not connect to Chrome')), { once: true });
  });
  const session = createSession(socket);
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Emulation.setTimezoneOverride', { timezoneId: STORY_TIME_ZONE });
  // Headless Chrome denies notifications outright, which the dashboard's header would show as "Notifications blocked".
  await session.send('Browser.grantPermissions', { permissions: ['notifications'] });

  async function evaluate(expression) {
    const evaluation = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description ?? evaluation.exceptionDetails.text);
    return evaluation.result.value;
  }

  async function clipOf(job) {
    if (job.clip) return job.clip;
    if (job.clipSelector) {
      const box = await evaluate(rectangleExpression(job.clipSelector));
      if (!box) throw new Error(`${job.output}: nothing matches ${job.clipSelector}`);
      return { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
    }
    if (job.fullPage) {
      const metrics = await session.send('Page.getLayoutMetrics');
      return { x: 0, y: 0, width: job.width, height: Math.ceil(metrics.cssContentSize.height) };
    }
    return null;
  }

  /** Runs one job; returns the measured rectangles of its `measure` selectors, keyed by name. */
  async function capture(job) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: job.width, height: job.height, deviceScaleFactor: job.scale ?? 2, mobile: false });
    await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: job.colorScheme ?? 'light' }] });
    await session.send('Emulation.setDefaultBackgroundColorOverride', job.transparentBackground ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const injectedScripts = [];
    if (job.frozenNow) injectedScripts.push((await session.send('Page.addScriptToEvaluateOnNewDocument', { source: clockFreezingScript(job.frozenNow) })).identifier);
    if (job.localStorageEntries) injectedScripts.push((await session.send('Page.addScriptToEvaluateOnNewDocument', { source: storageSeedingScript(job.localStorageEntries) })).identifier);
    try {
      // A hash-only change would not reload the page; about:blank in between makes every job a fresh load.
      const blank = session.nextLoad();
      await session.send('Page.navigate', { url: 'about:blank' });
      await blank;
      const loaded = session.nextLoad();
      await session.send('Page.navigate', { url: job.url });
      await loaded;
      await Bun.sleep(job.waitMilliseconds ?? 400);
      if (job.actionScript) {
        try {
          await evaluate(job.actionScript);
        } catch (error) {
          throw new Error(`${job.output ?? job.name}: action failed: ${error.message}`);
        }
        await Bun.sleep(job.settleMilliseconds ?? 350);
      }
      const measured = {};
      for (const [name, selector] of Object.entries(job.measure ?? {})) {
        measured[name] = await evaluate(rectangleExpression(selector));
        if (!measured[name]) throw new Error(`${job.name}: nothing matches ${selector}`);
      }
      if (job.output) {
        const clip = await clipOf(job);
        const screenshot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        mkdirSync(dirname(job.output), { recursive: true });
        writeFileSync(job.output, Buffer.from(screenshot.data, 'base64'));
      }
      return measured;
    } finally {
      for (const identifier of injectedScripts) await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  }

  async function close() {
    socket.close();
    chromeProcess.kill();
    await chromeProcess.exited;
    rmSync(userDataDirectory, { recursive: true, force: true });
  }

  return { capture, evaluate, close };
}
