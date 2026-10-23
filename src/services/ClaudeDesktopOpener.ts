import { spawn } from 'node:child_process';

import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';

export interface ClaudeDesktopOpeningRequest {
  claudeExecutable:    string;
  sessionId:           string;
  /** The project root: `claude --desktop --resume` looks the session up on its working directory. */
  root:                string;
  timeoutMilliseconds: number;
}

export type ClaudeDesktopOpening = { kind: 'opened' } | { kind: 'failed'; reason: string };

/** `claude --desktop` refuses to run with its output redirected, so macOS `script` gives it a pseudo-terminal of its own. */
const PSEUDO_TERMINAL_WRAPPER = ['script', '-q', '/dev/null'] as const;
const OUTPUT_MAXIMUM_CHARACTERS = 400;
/** The pseudo-terminal echoes `^D` and backspaces around what `claude` prints. */
const TERMINAL_NOISE_PATTERN = /\^D|[\u0000-\u0008\u000B-\u001F\u007F]/gu;

function readableOutputOf(output: string): string {
  return output.replace(TERMINAL_NOISE_PATTERN, '').trim().slice(0, OUTPUT_MAXIMUM_CHARACTERS);
}

/**
 * Runs `claude --desktop --resume <sessionId>` detached in the project root and settles on its exit: opened on exit 0,
 * failed with its output otherwise; still running past the bound counts as opened, and it is left to finish alone.
 */
export function openInClaudeDesktop(request: ClaudeDesktopOpeningRequest): Promise<ClaudeDesktopOpening> {
  const [wrapperExecutable, ...wrapperArguments] = PSEUDO_TERMINAL_WRAPPER;
  return new Promise((resolve) => {
    const opener = spawn(wrapperExecutable, [...wrapperArguments, request.claudeExecutable, '--desktop', '--resume', request.sessionId], {
      cwd:      request.root,
      detached: true,
      stdio:    ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const collectOutput = (chunk: string): void => {
      output += chunk;
    };
    opener.stdout.setEncoding('utf8').on('data', collectOutput);
    opener.stderr.setEncoding('utf8').on('data', collectOutput);

    function settle(opening: ClaudeDesktopOpening): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opener.unref();
      resolve(opening);
    }
    const timer = setTimeout(() => settle({ kind: 'opened' }), request.timeoutMilliseconds);
    opener.once('error', (error) => settle({ kind: 'failed', reason: `claude --desktop could not start: ${UnknownValueUtil.errorMessageOf(error)}` }));
    opener.once('close', (exitCode, signal) => {
      if (exitCode === 0) {
        settle({ kind: 'opened' });
        return;
      }
      const printed = readableOutputOf(output);
      settle({ kind: 'failed', reason: `claude --desktop exited (${signal ?? `exit ${exitCode ?? 'unknown'}`})${printed === '' ? '' : `: ${printed}`}` });
    });
  });
}
