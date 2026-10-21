/**
 * Everything a command may know about its process, so the parsing specs run in the test process against a scratch home.
 * It reads no environment itself: `src/shared/Environment.ts` is the one module that does.
 */
import { readFileSync }  from 'node:fs';
import { homedir }       from 'node:os';
import { join, resolve } from 'node:path';

import { agentProgressExecutableOverride, browserOpeningIsDisabled } from '../src/shared/Environment.ts';

export type InterruptionSignal = 'SIGINT' | 'SIGTERM';

export interface CommandContext {
  currentDirectory:         string;
  now:                      () => Date;
  standardOutput:           (text: string) => void;
  standardError:            (text: string) => void;
  /** `process.platform`, carried so a spec can choose the operating system whose browser opener a command picks. */
  platform:                 string;
  homeDirectory:            string;
  processId:                number;
  /** The Bun executable running this process, which a detached `serve` is started with. */
  runtimeExecutablePath:    string;
  /** The absolute path of `agent-dashboard.ts`, which a detached `serve` runs. */
  dashboardEntryPointPath:  string;
  /** `package.json`'s version, which the server reports as its identity. */
  version:                  string;
  agentProgressExecutable:  string | null;
  browserOpeningIsDisabled: boolean;
  /** Calls the listener once on the first SIGINT or SIGTERM; the returned function removes it. */
  onInterruption:           (listener: (signal: InterruptionSignal) => void) => () => void;
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

/** Absolute, since the server runs it in every tracked root: a relative one would name a file inside each of them. */
function agentProgressExecutableFrom(currentDirectory: string): string | null {
  const override = agentProgressExecutableOverride();
  return override === undefined ? Bun.which('agent-progress') ?? null : resolve(currentDirectory, override);
}

/** A function, never a module constant: a constant would read the process at import time and hand every spec the runner's own. */
export function createProcessContext(): CommandContext {
  const currentDirectory = process.cwd();
  return {
    currentDirectory,
    now:                      () => new Date(),
    standardOutput:           (text: string) => console.log(text),
    standardError:            (text: string) => console.error(text),
    platform:                 process.platform,
    homeDirectory:            homedir(),
    processId:                process.pid,
    runtimeExecutablePath:    process.execPath,
    dashboardEntryPointPath:  join(import.meta.dir, '..', 'agent-dashboard.ts'),
    version:                  packageVersion(),
    agentProgressExecutable:  agentProgressExecutableFrom(currentDirectory),
    browserOpeningIsDisabled: browserOpeningIsDisabled(),
    onInterruption:           listenForInterruption,
  };
}
