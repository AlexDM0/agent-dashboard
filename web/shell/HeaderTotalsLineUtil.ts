import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import type { HeaderTotals }                         from './HeaderTotals.ts';

/** Every live orchestrator session across the projects, dashboard-owned or watched; an ended one is not counted. */
function orchestratorCountOf(projects: ProjectSnapshot[], watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>): number {
  let count = 0;
  for (const project of projects) {
    const sessions = OrchestratorSessionUtil.sessionsOf(project, OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId));
    count += sessions.filter((session) => session.state !== 'ended').length;
  }
  return count;
}

/** `6/10 agents · 4 orchestrators · 1 ready · 0 review · 1 held`; the agents drop their `/limit` until a snapshot carries it. */
function lineOf(totals: HeaderTotals, machineParallelAgentLimit: number | null, orchestratorCount: number): string {
  const agents = machineParallelAgentLimit === null
    ? String(totals.agentsInFlight)
    : `${String(totals.agentsInFlight)}/${String(machineParallelAgentLimit)}`;
  const orchestratorWord = orchestratorCount === 1 ? 'orchestrator' : 'orchestrators';
  return [
    `${agents} agents`,
    `${String(orchestratorCount)} ${orchestratorWord}`,
    `${String(totals.readyCount)} ready`,
    `${String(totals.reviewWaitingCount)} review`,
    `${String(totals.heldCount)} held`,
  ].join(' · ');
}

export const HeaderTotalsLineUtil = Object.freeze({ orchestratorCountOf, lineOf });
