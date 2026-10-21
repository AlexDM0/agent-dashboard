import type { CommandContext } from './CommandContext.ts';

function openerCommandFor(platform: string, url: string): string[] {
  if (platform === 'darwin') return ['open', url];
  if (platform === 'win32') return ['cmd', '/c', 'start', '', url];
  return ['xdg-open', url];
}

export function openInTheDefaultBrowser(context: CommandContext, url: string): void {
  const openerCommand = openerCommandFor(context.platform, url);
  try {
    // Streams dropped: a browser launched cold would otherwise inherit the pipes and keep this process alive.
    const spawned = Bun.spawn(openerCommand, { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });
    spawned.unref();
  } catch (problem) {
    // Reported, not thrown: the URL is printed anyway, so a machine with no desktop is not a failed command.
    context.standardError(`\`${openerCommand[0] ?? ''}\` could not be run (${problem instanceof Error ? problem.message : String(problem)}); open the URL yourself.`);
  }
}
