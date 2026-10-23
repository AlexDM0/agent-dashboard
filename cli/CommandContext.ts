/**
 * Everything a command may know about its process, so the parsing specs run in the test process against a scratch home.
 * It reads no environment itself: `src/shared/Environment.ts` is the one module that does.
 */
import {
  accessSync,
  constants,
  readFileSync,
  statSync
} from 'node:fs';
import { availableParallelism, homedir } from 'node:os';
import { join, resolve }                 from 'node:path';

import { executablesRecordPathOf, readExecutablesRecord, type ExecutablesRecord }              from '../src/adapters/ExecutablesRecordReader.ts';
import { agentProgressExecutableOverride, browserOpeningIsDisabled, claudeExecutableOverride } from '../src/shared/Environment.ts';

export type InterruptionSignal = 'SIGINT' | 'SIGTERM';

export interface CommandContext {
  currentDirectory:          string;
  now:                       () => Date;
  standardOutput:            (text: string) => void;
  standardError:             (text: string) => void;
  /** `process.platform`, carried so a spec can choose the operating system whose browser opener a command picks. */
  platform:                  string;
  homeDirectory:             string;
  processId:                 number;
  /** The Bun executable running this process, which a detached `serve` is started with. */
  runtimeExecutablePath:     string;
  /** The absolute path of `agent-dashboard.ts`, which a detached `serve` runs. */
  dashboardEntryPointPath:   string;
  /** `package.json`'s version, which the server reports as its identity. */
  version:                   string;
  agentProgressExecutable:   string | null;
  /** The Claude Code executable a dashboard-owned orchestrator session runs, absolute, or null when none is found. */
  claudeExecutable:          string | null;
  browserOpeningIsDisabled:  boolean;
  /** `availableParallelism()`: the most agents this machine runs at once, which the header counts against. */
  machineParallelAgentLimit: number;
  /** Calls the listener once on the first SIGINT or SIGTERM; the returned function removes it. */
  onInterruption:            (listener: (signal: InterruptionSignal) => void) => () => void;
}

const INTERRUPTION_SIGNALS: readonly InterruptionSignal[] = ['SIGINT', 'SIGTERM'];

function packageVersion(): string {
  const packageDocument = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { version?: unknown };
  return typeof packageDocument.version === 'string' ? packageDocument.version : '0.0.0';
}

function listenForInterruption(listener: (signal: InterruptionSignal) => void): () => void {
  const removeEveryListener = (): void => {
    for (const signal of INTERRUPTION_SIGNALS) process.off(signal, signalListeners[signal]);
  };
  const signalListeners: Record<InterruptionSignal, () => void> = {
    SIGINT:  () => { removeEveryListener(); listener('SIGINT'); },
    SIGTERM: () => { removeEveryListener(); listener('SIGTERM'); },
  };
  for (const signal of INTERRUPTION_SIGNALS) process.on(signal, signalListeners[signal]);
  return removeEveryListener;
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The override, else `PATH`, else the path `setup.sh` recorded while it still names an executable file. Absolute, since
 * the server runs it in every tracked root: a relative one would name a file inside each of them.
 */
function executableFrom(currentDirectory: string, override: string | undefined, commandName: string, recordedPath: string | null): string | null {
  if (override !== undefined) return resolve(currentDirectory, override);
  const onPath = Bun.which(commandName);
  if (onPath !== null) return onPath;
  return recordedPath !== null && isExecutableFile(recordedPath) ? recordedPath : null;
}

function recordedExecutablesOf(homeDirectory: string): ExecutablesRecord {
  const reading = readExecutablesRecord(executablesRecordPathOf(homeDirectory));
  return reading.kind === 'present' ? reading.record : { claude: null, agentProgress: null };
}

/** A function, never a module constant: a constant would read the process at import time and hand every spec the runner's own. */
export function createProcessContext(): CommandContext {
  const currentDirectory = process.cwd();
  const homeDirectory = homedir();
  const recordedExecutables = recordedExecutablesOf(homeDirectory);
  return {
    currentDirectory,
    now:                       () => new Date(),
    standardOutput:            (text: string) => console.log(text),
    standardError:             (text: string) => console.error(text),
    platform:                  process.platform,
    homeDirectory,
    processId:                 process.pid,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', 'agent-dashboard.ts'),
    version:                   packageVersion(),
    agentProgressExecutable:   executableFrom(currentDirectory, agentProgressExecutableOverride(), 'agent-progress', recordedExecutables.agentProgress),
    claudeExecutable:          executableFrom(currentDirectory, claudeExecutableOverride(), 'claude', recordedExecutables.claude),
    browserOpeningIsDisabled:  browserOpeningIsDisabled(),
    machineParallelAgentLimit: availableParallelism(),
    onInterruption:            listenForInterruption,
  };
}
