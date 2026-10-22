/**
 * The one module that reads `process.env`; nothing else may. Every read is a getter rather than a value captured at
 * import, so a spec can set a variable in a child process and see it read.
 */

const AGENT_PROGRESS_EXECUTABLE_VARIABLE = 'AGENT_DASHBOARD_AGENT_PROGRESS';

const NO_BROWSER_VARIABLE = 'AGENT_DASHBOARD_NO_BROWSER';

/** The agent-progress executable to run instead of the one on `PATH`; an empty or whitespace-only value reads as unset. */
export function agentProgressExecutableOverride(): string | undefined {
  const value = process.env[AGENT_PROGRESS_EXECUTABLE_VARIABLE];
  if (value === undefined || value.trim().length === 0) return undefined;
  return value;
}

const CLAUDE_EXECUTABLE_VARIABLE = 'AGENT_DASHBOARD_CLAUDE';

/** The Claude Code executable an orchestrator session runs instead of the one on `PATH`; empty or whitespace reads as unset. */
export function claudeExecutableOverride(): string | undefined {
  const value = process.env[CLAUDE_EXECUTABLE_VARIABLE];
  if (value === undefined || value.trim().length === 0) return undefined;
  return value;
}

/** Any value but empty, whitespace or `0` disables opening the browser, so a `true` or `yes` is never ignored. */
export function browserOpeningIsDisabled(): boolean {
  const value = process.env[NO_BROWSER_VARIABLE]?.trim();
  return value !== undefined && value.length > 0 && value !== '0';
}

/** A copy of the whole environment, for a child process that should inherit it with a variable or two changed; a variable without a value is left out. */
export function environmentCopy(): Record<string, string> {
  return Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}
