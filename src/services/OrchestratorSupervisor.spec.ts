/**
 * The supervisor's Stop over fake sessions that ignore stdin closing, in a scratch home. What matters: `stopping` reaches
 * every client the moment Stop arrives, before any signal is sent, and `ended` once the child has exited; a busy session
 * that also ignores `SIGTERM` is gone by `SIGKILL` within the kill bound; one that ends its turn on the stream-json
 * `interrupt` request exits without any signal, so the signals are only for a session that lingers.
 */
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { type Socket, createConnection } from 'node:net';
import { join }                          from 'node:path';
import { afterEach, expect, test }       from 'bun:test';

import { orchestratorFilePathsOf }                               from '../shared/OrchestratorFilePaths.ts';
import { createShortScratchDirectory, removeScratchDirectory }   from '../testing/ScratchDirectory.ts';
import { waitUntil }                                             from '../testing/WaitUntil.ts';
import { type OrchestratorSupervisorEnd, superviseOrchestrator } from './OrchestratorSupervisor.ts';

const TRACKER_ID = 'example-stop-tracker';
const SHORT_STOP_GRACE_MILLISECONDS = 200;
const SHORT_KILL_GRACE_MILLISECONDS = 300;
const LONG_GRACE_MILLISECONDS = 30_000;
/** Room for a Bun child to start and the process group to be reaped, past the two graces. */
const END_WAIT_MILLISECONDS = 5_000;
const EXECUTABLE_MODE = 0o755;

type FakeSessionBehaviour = 'ignores-everything' | 'exits-on-interrupt';

interface StopFixture {
  home:                     string;
  transcriptPath:           string;
  end:                      Promise<OrchestratorSupervisorEnd>;
  client:                   Socket;
  states:                   string[];
  transcriptAtStoppingLine: string | null;
}

let fixture: StopFixture | null = null;

afterEach(async () => {
  if (fixture === null) return;
  fixture.client.destroy();
  await fixture.end;
  removeScratchDirectory(fixture.home);
  fixture = null;
});

/** A stand-in for `claude -p` that never replies, outlives its stdin closing, ignores `SIGTERM`, and records what reached it. */
function writeFakeSession(home: string, transcriptPath: string, behaviour: FakeSessionBehaviour): string {
  const scriptPath = join(home, 'fake-stopping-claude.ts');
  writeFileSync(scriptPath, [
    '#!/usr/bin/env bun',
    'import { appendFileSync } from "node:fs";',
    `const record = (text) => appendFileSync(${JSON.stringify(transcriptPath)}, text + "\\n");`,
    'process.on("SIGTERM", () => record("sigterm"));',
    'setInterval(() => {}, 1000);',
    'record("ready");',
    'for await (const line of console) {',
    '  let parsed = null;',
    '  try { parsed = JSON.parse(line); } catch {}',
    '  if (parsed?.type === "control_request" && parsed.request?.subtype === "interrupt") {',
    '    record("interrupt");',
    `    if (${JSON.stringify(behaviour)} === "exits-on-interrupt") process.exit(0);`,
    '  }',
    '}',
    'record("stdin-closed");',
    '',
  ].join('\n'));
  chmodSync(scriptPath, EXECUTABLE_MODE);
  return scriptPath;
}

function transcriptOf(transcriptPath: string): string {
  return existsSync(transcriptPath) ? readFileSync(transcriptPath, 'utf8') : '';
}

async function startBusySession(behaviour: FakeSessionBehaviour, stopGraceMilliseconds: number, killGraceMilliseconds: number): Promise<StopFixture> {
  const home = createShortScratchDirectory('ads');
  const transcriptPath = join(home, 'transcript.txt');
  appendFileSync(transcriptPath, '');
  const orchestratorDirectory = join(home, 'orchestrators');
  const end = superviseOrchestrator({
    trackerId:        TRACKER_ID,
    role:             'orchestrator',
    productOwnerMode: null,
    root:             home,
    claudeExecutable: writeFakeSession(home, transcriptPath, behaviour),
    orchestratorDirectory,
    supervisorPid:    process.pid,
    clock:            () => new Date(),
    stopGraceMilliseconds,
    killGraceMilliseconds,
  });
  const paths = orchestratorFilePathsOf(orchestratorDirectory, TRACKER_ID, 'orchestrator');
  await waitUntil(() => existsSync(paths.recordPath), 'the supervisor wrote its record');
  const client = createConnection(paths.socketPath);
  const started: StopFixture = {
    home, transcriptPath, end, client, states: [], transcriptAtStoppingLine: null
  };
  let unfinishedLine = '';
  client.setEncoding('utf8');
  client.on('error', () => {});
  client.on('data', (chunk: string) => {
    const lines = `${unfinishedLine}${chunk}`.split('\n');
    unfinishedLine = lines.pop() ?? '';
    for (const line of lines) {
      const parsed = JSON.parse(line) as { kind: string; state?: string };
      if (parsed.kind !== 'state' || parsed.state === undefined) continue;
      if (parsed.state === 'stopping' && started.transcriptAtStoppingLine === null) started.transcriptAtStoppingLine = transcriptOf(transcriptPath);
      started.states.push(parsed.state);
    }
  });
  await waitUntil(() => started.states.length > 0, 'the supervisor sent its first state line');
  await waitUntil(() => transcriptOf(transcriptPath).includes('ready'), 'the fake session handles SIGTERM');
  client.write(`${JSON.stringify({ kind: 'chat', text: 'Example long-running turn' })}\n`);
  await waitUntil(() => started.states.at(-1) === 'busy', 'the session is busy');
  return started;
}

/** The supervisor's end, once its last state line has reached the client too. */
async function endOf(stopFixture: StopFixture): Promise<OrchestratorSupervisorEnd> {
  const end = await stopFixture.end;
  await waitUntil(() => stopFixture.states.includes('ended'), 'the client read the ended state');
  return end;
}

test('stopping is broadcast before any signal, and a session ignoring stdin and SIGTERM is gone by SIGKILL within the bound', async () => {
  fixture = await startBusySession('ignores-everything', SHORT_STOP_GRACE_MILLISECONDS, SHORT_KILL_GRACE_MILLISECONDS);
  const stoppedAt = performance.now();
  fixture.client.write(`${JSON.stringify({ kind: 'stop' })}\n`);
  const end = await endOf(fixture);
  const endedAfterMilliseconds = performance.now() - stoppedAt;

  expect(fixture.states.slice(fixture.states.indexOf('busy'))).toEqual(['busy', 'stopping', 'ended']);
  expect(fixture.transcriptAtStoppingLine).not.toContain('sigterm');
  expect(transcriptOf(fixture.transcriptPath)).toBe('ready\ninterrupt\nstdin-closed\nsigterm\n');
  expect(end).toMatchObject({ kind: 'ended', signal: 'SIGKILL' });
  expect(endedAfterMilliseconds).toBeGreaterThanOrEqual(SHORT_STOP_GRACE_MILLISECONDS + SHORT_KILL_GRACE_MILLISECONDS);
  expect(endedAfterMilliseconds).toBeLessThan(END_WAIT_MILLISECONDS);
});

test('a session that ends its turn on the interrupt request exits without any signal', async () => {
  fixture = await startBusySession('exits-on-interrupt', LONG_GRACE_MILLISECONDS, LONG_GRACE_MILLISECONDS);
  fixture.client.write(`${JSON.stringify({ kind: 'stop' })}\n`);
  const end = await endOf(fixture);

  expect(end).toMatchObject({ kind: 'ended', exitCode: 0, signal: null });
  expect(transcriptOf(fixture.transcriptPath)).toBe('ready\ninterrupt\n');
  expect(fixture.states.slice(fixture.states.indexOf('busy'))).toEqual(['busy', 'stopping', 'ended']);
});

test('a chat sent while stopping is not delivered and the state stays stopping', async () => {
  fixture = await startBusySession('ignores-everything', SHORT_STOP_GRACE_MILLISECONDS, SHORT_KILL_GRACE_MILLISECONDS);
  fixture.client.write(`${JSON.stringify({ kind: 'stop' })}\n${JSON.stringify({ kind: 'chat', text: 'Example late message' })}\n`);
  await endOf(fixture);

  expect(fixture.states.slice(fixture.states.indexOf('stopping'))).toEqual(['stopping', 'ended']);
});
