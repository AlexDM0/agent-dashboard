/**
 * The server runs agent-progress in every tracked root, so an override typed as a relative path must reach it already
 * resolved against the directory it was typed in, never against each root. The real context reads the process, so it
 * is built in a child process whose working directory and environment the spec sets.
 */
import { join }                    from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { environmentCopy }                                from '../src/shared/Environment.ts';
import { createScratchDirectory, removeScratchDirectory } from '../src/testing/ScratchDirectory.ts';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

function agentProgressExecutableSeenFrom(currentDirectory: string, override: string): string {
  const childScript = [
    `import { createProcessContext } from ${JSON.stringify(join(import.meta.dir, 'CommandContext.ts'))};`,
    'process.stdout.write(String(createProcessContext().agentProgressExecutable));',
  ].join('\n');
  const child = Bun.spawnSync([process.execPath, '-e', childScript], {
    cwd:    currentDirectory,
    env:    { ...environmentCopy(), HOME: currentDirectory, AGENT_DASHBOARD_AGENT_PROGRESS: override },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(child.stderr.toString()).toBe('');
  return child.stdout.toString();
}

test('a relative agent-progress override is resolved against the directory the command was typed in', () => {
  const directory = createScratchDirectory('command-context');
  scratchDirectories.push(directory);
  expect(agentProgressExecutableSeenFrom(directory, './tools/example-agent-progress')).toBe(join(directory, 'tools', 'example-agent-progress'));
});

test('an absolute override is kept as written', () => {
  const directory = createScratchDirectory('command-context');
  scratchDirectories.push(directory);
  expect(agentProgressExecutableSeenFrom(directory, '/opt/example/agent-progress')).toBe('/opt/example/agent-progress');
});
