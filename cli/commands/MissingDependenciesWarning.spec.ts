/**
 * A release that adds a package leaves the main checkout without it until someone installs, and the page then cannot
 * build; `serve` and `open` must say which packages and the fix in the terminal, while the server still starts so the
 * API and the error page answer. An installed folder must print nothing.
 */
import { existsSync, mkdirSync }   from 'node:fs';
import { join }                    from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { DASHBOARD_PROTOCOL }                             from '../../src/shared/constants/DashboardProtocol.ts';
import { writeScratchDashboardFolder }                    from '../../src/testing/ScratchDashboardFolder.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchDirectory.ts';
import { runCommandLine }                                 from '../Main.ts';
import { serverRecordPathOf }                             from '../ServerRecordFile.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { freeDashboardPort }                              from '../testing/DashboardProcess.ts';
import { dependencyWarningOf }                            from './MissingDependenciesWarning.ts';

const SERVE_TIMEOUT_MILLISECONDS = 15_000;
const SERVER_LISTENING_POLL_MILLISECONDS = 20;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

async function askToShutDown(url: string): Promise<void> {
  await fetch(`${url}${DASHBOARD_PROTOCOL.SHUTDOWN_PATH}`, { method: 'POST', headers: { [DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_NAME]: DASHBOARD_PROTOCOL.SHUTDOWN_HEADER_VALUE } });
}

test('the warning names every missing package, the folder and the fix', () => {
  expect(dependencyWarningOf({ kind: 'unresolvable', packageNames: ['example-markdown', 'example-tables'] }, '/opt/example/agent-dashboard')).toBe(
    'The dashboard page cannot be built: example-markdown, example-tables are declared in package.json but not installed in /opt/example/agent-dashboard; '
    + 'run bun run setup (or bun install) there, then Restart server.',
  );
  expect(dependencyWarningOf({ kind: 'resolvable' }, '/opt/example/agent-dashboard')).toBeNull();
});

test('serve and open print the warning for a dashboard folder missing a package, and the server still starts', async () => {
  const scratchRoot = createScratchDirectory('missing-dependency');
  scratchDirectories.push(scratchRoot);
  const home = join(scratchRoot, 'home');
  const dashboardDirectory = join(scratchRoot, 'dashboard');
  mkdirSync(home);
  mkdirSync(dashboardDirectory);
  writeScratchDashboardFolder(dashboardDirectory, { declared: ['example-missing-package'], installed: [] });
  const context = { ...createCapturedCommandContext(home), dashboardDirectory };
  const port = freeDashboardPort();
  const url = `http://127.0.0.1:${port}`;
  const serving = runCommandLine(['serve', '--port', String(port)], context);
  while (!existsSync(serverRecordPathOf(home))) await Bun.sleep(SERVER_LISTENING_POLL_MILLISECONDS);

  const expectedWarning = `The dashboard page cannot be built: example-missing-package is declared in package.json but not installed in ${dashboardDirectory}; `
    + 'run bun run setup (or bun install) there, then Restart server.';
  expect(context.errorText()).toContain(expectedWarning);
  expect((await fetch(`${url}/`)).status).toBe(503);

  const openContext = { ...createCapturedCommandContext(home), dashboardDirectory };
  expect(await runCommandLine(['open', '--port', String(port), '--no-open'], openContext)).toBe(0);
  expect(openContext.outputText()).toContain(`The dashboard server runs at ${url}`);
  expect(openContext.errorText()).toBe(expectedWarning);

  await askToShutDown(url);
  expect(await serving).toBe(0);
}, SERVE_TIMEOUT_MILLISECONDS);

test('open over an installed dashboard folder prints no warning', async () => {
  const scratchRoot = createScratchDirectory('installed-dependency');
  scratchDirectories.push(scratchRoot);
  const home = join(scratchRoot, 'home');
  const dashboardDirectory = join(scratchRoot, 'dashboard');
  mkdirSync(home);
  mkdirSync(dashboardDirectory);
  writeScratchDashboardFolder(dashboardDirectory, { declared: ['example-installed-package'], installed: ['example-installed-package'] });
  const context = { ...createCapturedCommandContext(home), dashboardDirectory };
  const port = freeDashboardPort();
  const serving = runCommandLine(['serve', '--port', String(port)], context);
  while (!existsSync(serverRecordPathOf(home))) await Bun.sleep(SERVER_LISTENING_POLL_MILLISECONDS);

  const openContext = { ...createCapturedCommandContext(home), dashboardDirectory };
  expect(await runCommandLine(['open', '--port', String(port), '--no-open'], openContext)).toBe(0);
  expect(context.errorText()).not.toContain('cannot be built');
  expect(openContext.errorText()).toBe('');

  await askToShutDown(`http://127.0.0.1:${port}`);
  expect(await serving).toBe(0);
}, SERVE_TIMEOUT_MILLISECONDS);
