/**
 * Shell scripts standing in for the agent-progress CLI, so a spec decides what `status --json --full` prints, how it
 * exits and how long it takes, without a real tracker. Test-only.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

const EXECUTABLE_MODE = 0o755;

function shellQuoted(text: string): string {
  return `'${text.replaceAll('\'', '\'\\\'\'')}'`;
}

function writeScript(directory: string, name: string, body: string, interpreterLine = '#!/bin/sh'): string {
  const scriptPath = join(directory, name);
  writeFileSync(scriptPath, `${interpreterLine}\n${body}\n`);
  chmodSync(scriptPath, EXECUTABLE_MODE);
  return scriptPath;
}

/** Prints the file's content for `status --json --full` and exits 0; any other arguments exit 64 so a wrong call shows. */
export function fakeExecutablePrinting(directory: string, documentPath: string): string {
  return writeScript(directory, 'fake-agent-progress-printing', [
    'if [ "$1 $2 $3" != "status --json --full" ]; then echo "unexpected arguments: $*" >&2; exit 64; fi',
    `cat ${shellQuoted(documentPath)}`,
  ].join('\n'));
}

/** Fails, naming on stderr the working directory it was started in and its `AGENT_PROGRESS_ROOT`, to prove where and how the reader ran it. */
export function fakeExecutableReportingItsSurroundings(directory: string): string {
  return writeScript(directory, 'fake-agent-progress-surroundings', 'echo "directory=$(pwd -P) root=${AGENT_PROGRESS_ROOT-unset}" >&2\nexit 3');
}

export function fakeExecutableFailing(directory: string, standardError: string, exitCode: number): string {
  return writeScript(directory, 'fake-agent-progress-failing', `printf %s ${shellQuoted(standardError)} >&2\nexit ${exitCode}`);
}

export function fakeExecutableSleeping(directory: string, seconds: number): string {
  return writeScript(directory, 'fake-agent-progress-sleeping', `exec sleep ${seconds}`);
}

/** Not `exec`: the sleep is a grandchild holding the output pipes after the shell itself is gone. */
export function fakeExecutableWrappingASleep(directory: string, seconds: number): string {
  return writeScript(directory, 'fake-agent-progress-wrapper', `sleep ${seconds}\necho '{}'`);
}

/** A Bun script, as agent-progress is, failing with whether a `bunfig.toml` preload ran and what a `.env` set. */
export function fakeBunExecutableReportingItsLoadedFiles(directory: string): string {
  return writeScript(
    directory,
    'fake-agent-progress-bun.ts',
    [
      'const preloadRan = (globalThis as { examplePreloadRan?: boolean }).examplePreloadRan === true;',
      'process.stderr.write(`preload=${preloadRan} dotenv=${process.env[\'EXAMPLE_DOTENV_VALUE\'] ?? \'unset\'}`);',
      'process.exit(3);',
    ].join('\n'),
    '#!/usr/bin/env bun',
  );
}

export function fakeExecutablePrintingText(directory: string, standardOutput: string): string {
  return writeScript(directory, 'fake-agent-progress-text', `printf %s ${shellQuoted(standardOutput)}`);
}

/**
 * Keeps a concurrency limit in `limitPath`: `concurrency <n>` appends its arguments and working directory to `callLogPath`,
 * refuses a limit outside 1 to 10 at exit 1 as the CLI does, and stores it; `status --json --full` prints the document
 * with the concurrency block's limit replaced by the stored one.
 */
export function fakeExecutableKeepingAConcurrencyLimit(directory: string, documentPath: string, limitPath: string, callLogPath: string): string {
  return writeScript(directory, 'fake-agent-progress-concurrency', [
    'if [ "$1" = concurrency ]; then',
    `  echo "$* in $(pwd -P)" >> ${shellQuoted(callLogPath)}`,
    '  case "$2" in',
    '    [1-9]|10) ;;',
    '    *) echo "\\"$2\\" is not a concurrency limit. Write a whole number of agents from 1 to 10." >&2; exit 1;;',
    '  esac',
    `  printf %s "$2" > ${shellQuoted(limitPath)}`,
    '  exit 0',
    'fi',
    'if [ "$1 $2 $3" != "status --json --full" ]; then echo "unexpected arguments: $*" >&2; exit 64; fi',
    `limit=$(cat ${shellQuoted(limitPath)} 2>/dev/null || echo 2)`,
    `sed "s/\\"limit\\": 2,/\\"limit\\": $limit,/" ${shellQuoted(documentPath)}`,
  ].join('\n'));
}

/**
 * Keeps a dispatcher state in `statePath`, starting at `running`: `dispatcher <state>` appends its arguments and working
 * directory to `callLogPath`, refuses a word other than running, finished or stopped at exit 1 as the CLI does, and
 * stores it; `status --json --full` prints the document with the concurrency block's dispatcherState replaced.
 */
export function fakeExecutableKeepingADispatcherState(directory: string, documentPath: string, statePath: string, callLogPath: string): string {
  return writeScript(directory, 'fake-agent-progress-dispatcher', [
    'if [ "$1" = dispatcher ]; then',
    `  echo "$* in $(pwd -P)" >> ${shellQuoted(callLogPath)}`,
    '  case "$2" in',
    '    running|finished|stopped) ;;',
    '    *) echo "\\"$2\\" is not a dispatcher state. Write running, finished or stopped." >&2; exit 1;;',
    '  esac',
    `  printf %s "$2" > ${shellQuoted(statePath)}`,
    '  exit 0',
    'fi',
    'if [ "$1 $2 $3" != "status --json --full" ]; then echo "unexpected arguments: $*" >&2; exit 64; fi',
    `state=$(cat ${shellQuoted(statePath)} 2>/dev/null || echo running)`,
    `sed "s/\\"dispatcherState\\": \\"[a-z]*\\"/\\"dispatcherState\\": \\"$state\\"/" ${shellQuoted(documentPath)}`,
  ].join('\n'));
}

/** Prints the document only once `releasePath` exists, so a spec decides when the first status read ends. */
export function fakeExecutablePrintingOnceReleased(directory: string, documentPath: string, releasePath: string): string {
  return writeScript(directory, 'fake-agent-progress-released', [
    `while [ ! -e ${shellQuoted(releasePath)} ]; do sleep 0.02; done`,
    `cat ${shellQuoted(documentPath)}`,
  ].join('\n'));
}
