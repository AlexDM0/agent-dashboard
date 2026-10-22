/** A `CommandContext` whose output streams are arrays, so a spec drives `runCommandLine` in-process and reads back what a person would see. */
import { join } from 'node:path';

import { requireScratchDirectory } from '../../src/testing/ScratchDirectory.ts';
import type { CommandContext }     from '../CommandContext.ts';

export interface CapturedCommandContext extends CommandContext {
  outputText: () => string;
  errorText:  () => string;
}

const SPEC_CLOCK_READING = '2026-09-18T20:11:03Z';

/** Never a real process id: a spec that reaches process liveness then sees no process rather than the test runner. */
const SPEC_PROCESS_ID = 2_147_483_000;
const SPEC_MACHINE_PARALLEL_AGENT_LIMIT = 12;

export function createCapturedCommandContext(homeDirectory: string): CapturedCommandContext {
  requireScratchDirectory(homeDirectory);
  const outputLines: string[] = [];
  const errorLines:  string[] = [];
  return {
    currentDirectory:          homeDirectory,
    now:                       () => new Date(SPEC_CLOCK_READING),
    standardOutput:            (text: string) => { outputLines.push(text); },
    standardError:             (text: string) => { errorLines.push(text); },
    platform:                  'linux',
    homeDirectory,
    processId:                 SPEC_PROCESS_ID,
    runtimeExecutablePath:     process.execPath,
    dashboardEntryPointPath:   join(import.meta.dir, '..', '..', 'agent-dashboard.ts'),
    version:                   '0.0.0-spec',
    agentProgressExecutable:   null,
    claudeExecutable:          null,
    browserOpeningIsDisabled:  true,
    machineParallelAgentLimit: SPEC_MACHINE_PARALLEL_AGENT_LIMIT,
    onInterruption:            () => () => {},
    outputText:                () => outputLines.join('\n'),
    errorText:                 () => errorLines.join('\n'),
  };
}
