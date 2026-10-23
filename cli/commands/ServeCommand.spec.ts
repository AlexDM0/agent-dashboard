/**
 * After a restart `serve` hands its port to a detached successor; when that successor exits before it answers, the page
 * would sit on reconnecting with no reason anywhere but the log, so `serve` must say so, naming the exit and the log.
 */
import { existsSync }              from 'node:fs';
import { afterEach, expect, test } from 'bun:test';

import { DASHBOARD_PROTOCOL }                             from '../../src/shared/constants/DashboardProtocol.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchDirectory.ts';
import { runCommandLine }                                 from '../Main.ts';
import { serverLogPathOf, serverRecordPathOf }            from '../ServerRecordFile.ts';
import { createCapturedCommandContext }                   from '../testing/CapturedCommandContext.ts';
import { freeDashboardPort }                              from '../testing/DashboardProcess.ts';

const SERVE_RESTART_TIMEOUT_MILLISECONDS = 15_000;
const SERVER_LISTENING_POLL_MILLISECONDS = 20;

const scratchHomes: string[] = [];

afterEach(() => {
  for (const home of scratchHomes.splice(0)) removeScratchDirectory(home);
});

test('a restart whose successor exits before answering says it stopped while starting and names the log', async () => {
  const home = createScratchDirectory('serve-restart-home');
  scratchHomes.push(home);
  // A successor runtime that exits at once with 1, as a server that cannot bind its port would.
  const context = { ...createCapturedCommandContext(home), runtimeExecutablePath: '/usr/bin/false' };
  const port = freeDashboardPort();
  const url = `http://127.0.0.1:${port}`;
  const serving = runCommandLine(['serve', '--port', String(port)], context);
  while (!existsSync(serverRecordPathOf(home))) await Bun.sleep(SERVER_LISTENING_POLL_MILLISECONDS);

  const restart = await fetch(`${url}${DASHBOARD_PROTOCOL.RESTART_PATH}`, {
    method:  'POST',
    headers: { [DASHBOARD_PROTOCOL.RESTART_HEADER_NAME]: DASHBOARD_PROTOCOL.RESTART_HEADER_VALUE, Origin: url },
  });
  expect(restart.status).toBe(DASHBOARD_PROTOCOL.SHUTDOWN_ACCEPTED_STATUS);

  expect(await serving).toBe(0);
  expect(context.outputText()).toContain(`Restarting the dashboard server at ${url}.`);
  expect(context.errorText()).toContain(`The dashboard server stopped while starting (exit 1); its log is ${serverLogPathOf(home)}.`);
}, SERVE_RESTART_TIMEOUT_MILLISECONDS);
