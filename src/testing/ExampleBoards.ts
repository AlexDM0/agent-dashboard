/** Board summaries and registry files with obviously synthetic values, for the monitor and server specs. Test-only. */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join }                                 from 'node:path';

import { type BoardSummary }       from '../shared/DashboardContract.ts';
import { requireScratchDirectory } from './ScratchDirectory.ts';

export function exampleBoardSummary(overrides: Partial<BoardSummary> = {}): BoardSummary {
  return {
    dispatcherState:     'stopped',
    concurrencyLimit:    2,
    agentsInFlight:      0,
    freeSlots:           2,
    ticketCountByStatus: {
      'pending': 1, 'in-progress': 0, 'in-review': 0, 'reviewed': 0, 'delivered': 0, 'abandoned': 0
    },
    ticketTotal:            1,
    activeRows:             [],
    readyTicketIds:         ['001'],
    heldTicketIds:          [],
    reviewWaitingTicketIds: [],
    pausedBuildCount:       0,
    recentLog:              [],
    tokensTotal:            0,
    ...overrides,
  };
}

/** A project root with its `.agent-progress/` folder and, unless told otherwise, a `progress.html` in it. */
export function createExampleProjectRoot(parentDirectory: string, name: string, withPage = true): string {
  requireScratchDirectory(parentDirectory);
  const root = join(parentDirectory, name);
  mkdirSync(join(root, '.agent-progress'), { recursive: true });
  if (withPage) writeFileSync(join(root, '.agent-progress', 'progress.html'), `<!doctype html><title>${name}</title>`);
  return root;
}

export function exampleRegistryEntry(root: string, project: string): Record<string, unknown> {
  return {
    project,
    root,
    progressHtml:  join(root, '.agent-progress', 'progress.html'),
    progressJson:  join(root, '.agent-progress', 'progress.json'),
    gitOrigin:     `git@example.invalid:example/${project}.git`,
    registeredAt:  '2026-10-21T10:00:00+02:00',
    lastChangedAt: '2026-10-21T11:30:00+02:00',
    lastCommand:   'ticket finish',
  };
}

/** Writes the registry under the home folder by rename, as agent-progress does. */
export function writeExampleRegistry(homeDirectory: string, projects: Record<string, Record<string, unknown>>, version = 1): void {
  requireScratchDirectory(homeDirectory);
  const registryFolder = join(homeDirectory, '.agent-progress-monitor');
  mkdirSync(registryFolder, { recursive: true });
  const temporaryPath = join(registryFolder, 'projects.json.example.tmp');
  writeFileSync(temporaryPath, `${JSON.stringify({ version, projects }, null, 2)}\n`);
  renameSync(temporaryPath, join(registryFolder, 'projects.json'));
}
