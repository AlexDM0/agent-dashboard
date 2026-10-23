import { superviseOrchestrator }   from '../../src/services/OrchestratorSupervisor.ts';
import type { SessionRole }        from '../../src/shared/DashboardContract.ts';
import { orchestratorDirectoryOf } from '../../src/shared/OrchestratorFilePaths.ts';
import { DASHBOARD_LIMITS }        from '../../src/shared/constants/DashboardLimits.ts';
import type { CommandContext }     from '../CommandContext.ts';
import { CommandRefusal }          from '../CommandRefusal.ts';

/** Run by the server alone, detached with its output to the supervisor's log; it returns when the session has ended. */
export async function superviseCommand(trackerId: string, root: string, role: SessionRole, context: CommandContext): Promise<void> {
  if (context.claudeExecutable === null) throw new CommandRefusal('claude is not on PATH; set AGENT_DASHBOARD_CLAUDE to its path, or rerun setup.sh.');
  const end = await superviseOrchestrator({
    trackerId,
    role,
    root,
    claudeExecutable:      context.claudeExecutable,
    orchestratorDirectory: orchestratorDirectoryOf(context.homeDirectory),
    supervisorPid:         context.processId,
    clock:                 context.now,
    stopGraceMilliseconds: DASHBOARD_LIMITS.SESSION_STOP_GRACE_MILLISECONDS,
  });
  if (end.kind === 'refused') throw new CommandRefusal(`${end.reason}.`);
  const howItEnded = end.signal === null ? `exit code ${end.exitCode ?? 'unknown'}` : `signal ${end.signal}`;
  context.standardOutput(`${context.now().toISOString()} The ${role} session ${end.sessionId} of ${trackerId} ended with ${howItEnded}.`);
}
