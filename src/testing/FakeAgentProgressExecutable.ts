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

/** Prints the document only once `releasePath` exists, so a spec decides when the first status read ends. */
export function fakeExecutablePrintingOnceReleased(directory: string, documentPath: string, releasePath: string): string {
  return writeScript(directory, 'fake-agent-progress-released', [
    `while [ ! -e ${shellQuoted(releasePath)} ]; do sleep 0.02; done`,
    `cat ${shellQuoted(documentPath)}`,
  ].join('\n'));
}
