/**
 * The server runs agent-progress in every tracked root, so an override typed as a relative path must reach it already
 * resolved against the directory it was typed in, never against each root. Each executable is found by override, then
 * `PATH`, then the path `setup.sh` recorded, so a server started without `~/.local/bin` on `PATH` still finds `claude`;
 * a recorded path that no longer exists, or a damaged record, finds nothing and never throws. The real context reads
 * the process, so it is built in a child process whose working directory, home, `PATH` and environment the spec sets.
 */
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }                       from 'node:path';
import { afterEach, expect, test }             from 'bun:test';

import { executablesRecordPathOf }                        from '../src/adapters/ExecutablesRecordReader.ts';
import { environmentCopy }                                from '../src/shared/Environment.ts';
import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchDirectory.ts';

const EXECUTABLE_MODE = 0o755;

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function scratchHome(): string {
  const directory = createScratchDirectory('command-context');
  scratchDirectories.push(directory);
  return directory;
}

function exampleExecutable(path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, EXECUTABLE_MODE);
  return path;
}

function writeExecutablesRecord(homeDirectory: string, text: string): void {
  const recordPath = executablesRecordPathOf(homeDirectory);
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(recordPath, text);
}

interface ChildSetting {
  homeDirectory: string;
  searchPath:    string;
  overrides?:    Record<string, string>;
}

function executablesSeenBy(setting: ChildSetting): { claude: string | null; agentProgress: string | null } {
  const childScript = [
    `import { createProcessContext } from ${JSON.stringify(join(import.meta.dir, 'CommandContext.ts'))};`,
    'const context = createProcessContext();',
    'process.stdout.write(JSON.stringify({ claude: context.claudeExecutable, agentProgress: context.agentProgressExecutable }));',
  ].join('\n');
  const inheritedEnvironment = environmentCopy();
  delete inheritedEnvironment['AGENT_DASHBOARD_CLAUDE'];
  delete inheritedEnvironment['AGENT_DASHBOARD_AGENT_PROGRESS'];
  const child = Bun.spawnSync([process.execPath, '-e', childScript], {
    cwd: setting.homeDirectory,
    env: {
      ...inheritedEnvironment, HOME: setting.homeDirectory, PATH: setting.searchPath, ...setting.overrides
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.stderr.toString()).toBe('');
  return JSON.parse(child.stdout.toString()) as { claude: string | null; agentProgress: string | null };
}

test('a relative agent-progress override is resolved against the directory the command was typed in', () => {
  const home = scratchHome();
  const seen = executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty'), overrides: { AGENT_DASHBOARD_AGENT_PROGRESS: './tools/example-agent-progress' } });
  expect(seen.agentProgress).toBe(join(home, 'tools', 'example-agent-progress'));
});

test('an absolute override is kept as written', () => {
  const home = scratchHome();
  const seen = executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty'), overrides: { AGENT_DASHBOARD_AGENT_PROGRESS: '/opt/example/agent-progress' } });
  expect(seen.agentProgress).toBe('/opt/example/agent-progress');
});

test('an override wins over an executable on PATH and a recorded one', () => {
  const home = scratchHome();
  exampleExecutable(join(home, 'bin', 'claude'));
  const recordedClaude = exampleExecutable(join(home, 'recorded', 'claude'));
  writeExecutablesRecord(home, JSON.stringify({ claude: recordedClaude, agentProgress: null }));
  const seen = executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'bin'), overrides: { AGENT_DASHBOARD_CLAUDE: '/opt/example/claude' } });
  expect(seen.claude).toBe('/opt/example/claude');
});

test('an executable on PATH wins over a recorded one', () => {
  const home = scratchHome();
  const claudeOnPath = exampleExecutable(join(home, 'bin', 'claude'));
  const agentProgressOnPath = exampleExecutable(join(home, 'bin', 'agent-progress'));
  const recordedClaude = exampleExecutable(join(home, 'recorded', 'claude'));
  const recordedAgentProgress = exampleExecutable(join(home, 'recorded', 'agent-progress'));
  writeExecutablesRecord(home, JSON.stringify({ claude: recordedClaude, agentProgress: recordedAgentProgress }));
  expect(executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'bin') })).toEqual({ claude: claudeOnPath, agentProgress: agentProgressOnPath });
});

test('with neither an override nor PATH naming them, the recorded executables are used', () => {
  const home = scratchHome();
  const recordedClaude = exampleExecutable(join(home, '.local', 'share', 'claude', 'versions', 'example'));
  const recordedAgentProgress = exampleExecutable(join(home, 'recorded', 'agent-progress'));
  writeExecutablesRecord(home, JSON.stringify({ claude: recordedClaude, agentProgress: recordedAgentProgress }));
  expect(executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty') })).toEqual({ claude: recordedClaude, agentProgress: recordedAgentProgress });
});

test('a recorded path that no longer exists is ignored', () => {
  const home = scratchHome();
  writeExecutablesRecord(home, JSON.stringify({ claude: join(home, 'gone', 'claude'), agentProgress: join(home, 'gone', 'agent-progress') }));
  expect(executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty') })).toEqual({ claude: null, agentProgress: null });
});

test('a recorded path that is not executable is ignored', () => {
  const home = scratchHome();
  const notExecutable = join(home, 'recorded', 'claude');
  mkdirSync(dirname(notExecutable), { recursive: true });
  writeFileSync(notExecutable, 'not a program\n');
  writeExecutablesRecord(home, JSON.stringify({ claude: notExecutable, agentProgress: null }));
  expect(executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty') }).claude).toBeNull();
});

test('a malformed record is ignored without a throw', () => {
  const home = scratchHome();
  writeExecutablesRecord(home, '{"claude": ');
  expect(executablesSeenBy({ homeDirectory: home, searchPath: join(home, 'empty') })).toEqual({ claude: null, agentProgress: null });
});
