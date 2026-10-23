import type { DependencyResolution } from '../../src/adapters/DependencyResolutionReader.ts';
import type { CommandContext }       from '../CommandContext.ts';

export function dependencyWarningOf(resolution: DependencyResolution, dashboardDirectory: string): string | null {
  if (resolution.kind === 'resolvable') return null;
  if (resolution.kind === 'unreadable') return `The dashboard's package.json could not be checked for missing packages: ${resolution.reason}.`;
  const packageList = resolution.packageNames.join(', ');
  const verb = resolution.packageNames.length === 1 ? 'is' : 'are';
  return `The dashboard page cannot be built: ${packageList} ${verb} declared in package.json but not installed in ${dashboardDirectory}; `
    + 'run bun run setup (or bun install) there, then Restart server.';
}

/** On standard error, so it reaches the terminal and, for a detached server, its log. */
export function printDependencyWarning(context: CommandContext, resolution: DependencyResolution): void {
  const warning = dependencyWarningOf(resolution, context.dashboardDirectory);
  if (warning !== null) context.standardError(warning);
}
