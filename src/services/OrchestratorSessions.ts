/**
 * The server's side of the dashboard-owned orchestrators: it starts a detached supervisor per project, connects to every
 * supervisor whose record lives (again after a server restart), holds each session's latest state, and sends chat and
 * stop to it. Closing it disconnects and leaves every supervisor running. Nothing here throws on a supervisor gone.
 */
import { spawn } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  openSync,
  rmSync
} from 'node:fs';
import { type Socket, createConnection } from 'node:net';

import { readOrchestratorRecord, readOrchestratorRecords } from '../adapters/OrchestratorRecordReader.ts';
import { type SupervisorRequest, supervisorStateOf }       from '../adapters/SupervisorLineReader.ts';
import { processIsAlive }                                  from '../lib/process-liveness/ProcessIsAlive.ts';
import type { OrchestratorSession }                        from '../shared/DashboardContract.ts';
import { orchestratorFilePathsOf }                         from '../shared/OrchestratorFilePaths.ts';
import { UnknownValueUtil }                                from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_LIMITS }                                from '../shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                              from '../shared/constants/DashboardProtocol.ts';

export interface OrchestratorSessionsOptions {
  orchestratorDirectory:    string;
  /** The Bun running the server and `agent-dashboard.ts`, which a supervisor is started with. */
  runtimeExecutablePath:    string;
  dashboardEntryPointPath:  string;
  startTimeoutMilliseconds: number;
  reconnectMilliseconds:    number;
}

export type OrchestratorLaunch =
  | { kind: 'started'; session: OrchestratorSession }
  | { kind: 'running' }
  | { kind: 'refused'; reason: string }
  | { kind: 'failed'; reason: string };

export type SupervisorDelivery = { kind: 'delivered' } | { kind: 'none' } | { kind: 'failed'; reason: string };

export interface OrchestratorSessions {
  /** Connects to every supervisor whose record lives and removes the records of those gone. */
  start(): void;
  /** The project's dashboard-owned session, live or ended since this server started, or null. */
  sessionOf(trackerId: string): OrchestratorSession | null;
  isLive(trackerId: string): boolean;
  launch(trackerId: string, root: string, firstMessage: string | null): Promise<OrchestratorLaunch>;
  stop(trackerId: string): Promise<SupervisorDelivery>;
  chat(trackerId: string, text: string): Promise<SupervisorDelivery>;
  /** Called on every change of a session's state; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  close(): void;
}

interface Supervised {
  recordPath:     string;
  socketPath:     string;
  supervisorPid:  number;
  session:        OrchestratorSession;
  connection:     Socket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const START_POLL_MILLISECONDS = 50;

function sessionFromRecord(sessionId: string, sessionPid: number, startedAt: string): OrchestratorSession {
  return {
    ownership: 'dashboard', sessionId, pid: sessionPid, state: 'starting', startedAt, context: null, pendingQuestions: []
  };
}

export function createOrchestratorSessions(options: OrchestratorSessionsOptions): OrchestratorSessions {
  const supervisedByTracker = new Map<string, Supervised>();
  const listeners = new Set<() => void>();
  const trackersBeingLaunched = new Set<string>();
  let closed = false;

  function notify(): void {
    for (const listener of [...listeners]) listener();
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
          const state = supervisorStateOf(line);
          if (state === null) continue;
          supervised.session = {
            ...supervised.session, state: state.state, context: state.context, pendingQuestions: state.pendingQuestions
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

  function start(): void {
    for (const reading of readOrchestratorRecords(options.orchestratorDirectory)) {
      if (reading.kind !== 'present') continue;
      const { record } = reading;
      if (!processIsAlive(record.supervisorPid)) {
        rmSync(reading.recordPath, { force: true });
        rmSync(record.socketPath, { force: true });
        continue;
      }
      const supervised: Supervised = {
        recordPath:     reading.recordPath,
        socketPath:     record.socketPath,
        supervisorPid:  record.supervisorPid,
        session:        sessionFromRecord(record.sessionId, record.sessionPid, record.startedAt),
        connection:     null,
        reconnectTimer: null,
      };
      supervisedByTracker.set(record.trackerId, supervised);
      void connect(supervised);
    }
  }

  function isLive(trackerId: string): boolean {
    const supervised = supervisedByTracker.get(trackerId);
    return supervised !== undefined && supervised.session.state !== 'ended';
  }

  function spawnSupervisor(trackerId: string, root: string, logPath: string): { pid: number | undefined; exited: Promise<string> } {
    mkdirSync(options.orchestratorDirectory, { recursive: true });
    const logDescriptor = openSync(logPath, 'a');
    try {
      const supervisor = spawn(options.runtimeExecutablePath, [options.dashboardEntryPointPath, DASHBOARD_PROTOCOL.SUPERVISE_COMMAND, trackerId, root], {
        cwd:      options.orchestratorDirectory,
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

  async function launch(trackerId: string, root: string, firstMessage: string | null): Promise<OrchestratorLaunch> {
    const paths = orchestratorFilePathsOf(options.orchestratorDirectory, trackerId);
    const onDisk = readOrchestratorRecord(paths.recordPath);
    const supervisorRuns = isLive(trackerId) || (onDisk.kind === 'present' && processIsAlive(onDisk.record.supervisorPid));
    if (supervisorRuns || trackersBeingLaunched.has(trackerId)) return { kind: 'running' };
    trackersBeingLaunched.add(trackerId);
    try {
      return await launchSupervisor(trackerId, root, firstMessage);
    } finally {
      trackersBeingLaunched.delete(trackerId);
    }
  }

  async function launchSupervisor(trackerId: string, root: string, firstMessage: string | null): Promise<OrchestratorLaunch> {
    const paths = orchestratorFilePathsOf(options.orchestratorDirectory, trackerId);
    if (Buffer.byteLength(paths.socketPath) > DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES) {
      return { kind: 'refused', reason: `The socket path ${paths.socketPath} is longer than ${DASHBOARD_LIMITS.MAXIMUM_SOCKET_PATH_BYTES} bytes` };
    }
    const supervisor = spawnSupervisor(trackerId, root, paths.logPath);
    let exitReason: string | null = null;
    void supervisor.exited.then((reason) => { exitReason = reason; });
    const deadline = performance.now() + options.startTimeoutMilliseconds;
    while (performance.now() < deadline && exitReason === null) {
      const reading = readOrchestratorRecord(paths.recordPath);
      if (reading.kind === 'present' && reading.record.supervisorPid === supervisor.pid) {
        const { record } = reading;
        const supervised: Supervised = {
          recordPath:     paths.recordPath,
          socketPath:     record.socketPath,
          supervisorPid:  record.supervisorPid,
          session:        sessionFromRecord(record.sessionId, record.sessionPid, record.startedAt),
          connection:     null,
          reconnectTimer: null,
        };
        if (await connect(supervised)) {
          supervisedByTracker.set(trackerId, supervised);
          if (firstMessage !== null) await chat(trackerId, firstMessage);
          notify();
          return { kind: 'started', session: supervised.session };
        }
      }
      await Bun.sleep(START_POLL_MILLISECONDS);
    }
    return { kind: 'failed', reason: exitReason ?? `The supervisor did not accept within ${options.startTimeoutMilliseconds} ms; its log is ${paths.logPath}` };
  }

  function send(trackerId: string, request: SupervisorRequest): Promise<SupervisorDelivery> {
    const supervised = supervisedByTracker.get(trackerId);
    if (supervised === undefined || supervised.session.state === 'ended') return Promise.resolve({ kind: 'none' });
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
    for (const supervised of supervisedByTracker.values()) {
      if (supervised.reconnectTimer !== null) clearTimeout(supervised.reconnectTimer);
      supervised.connection?.destroy();
    }
    listeners.clear();
  }

  function chat(trackerId: string, text: string): Promise<SupervisorDelivery> {
    return send(trackerId, { kind: 'chat', text });
  }

  return {
    start,
    sessionOf: (trackerId) => supervisedByTracker.get(trackerId)?.session ?? null,
    isLive,
    launch,
    stop:      (trackerId) => send(trackerId, { kind: 'stop' }),
    chat,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close,
  };
}
