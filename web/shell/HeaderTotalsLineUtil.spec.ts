/**
 * The header's one mono line carries exactly the numbers `headerTotalsOf` computes, with the agents over the machine's
 * limit; the orchestrator count takes dashboard-owned and watched sessions alike and skips an ended one.
 */
import { expect, test }                                                    from 'bun:test';
import { fleetSnapshotWith, orchestratorSessionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { headerTotalsOf }                                                  from './HeaderTotals.ts';
import { HeaderTotalsLineUtil }                                            from './HeaderTotalsLineUtil.ts';

test('the line carries the totals headerTotalsOf computes, agents over the machine limit', () => {
  const totals = {
    projectCount: 6, agentsInFlight: 6, readyCount: 1, reviewWaitingCount: 2, heldCount: 1
  };
  expect(HeaderTotalsLineUtil.lineOf(totals, 10, 4)).toBe('6/10 agents · 4 orchestrators · 1 ready · 2 review · 1 held');
});

test('before a snapshot carries the machine limit the agents stand alone, and one orchestrator is singular', () => {
  const totals = {
    projectCount: 0, agentsInFlight: 0, readyCount: 0, reviewWaitingCount: 0, heldCount: 0
  };
  expect(HeaderTotalsLineUtil.lineOf(totals, null, 1)).toBe('0 agents · 1 orchestrator · 0 ready · 0 review · 0 held');
});

test('the fleet fixture counts four orchestrators, the watched one among them, and its agents from headerTotalsOf', () => {
  const snapshot = fleetSnapshotWith();
  const orchestratorCount = HeaderTotalsLineUtil.orchestratorCountOf(snapshot.projects, snapshot.watchedOrchestratorsByTracker);
  expect(orchestratorCount).toBe(4);
  expect(HeaderTotalsLineUtil.lineOf(headerTotalsOf(snapshot.projects), snapshot.machineParallelAgentLimit, orchestratorCount))
    .toBe('4/8 agents · 4 orchestrators · 1 ready · 1 review · 1 held');
});

test('an ended session is no orchestrator', () => {
  const projects = [projectSnapshotWith('example-archive', { orchestrator: orchestratorSessionWith({ state: 'ended' }) })];
  expect(HeaderTotalsLineUtil.orchestratorCountOf(projects, {})).toBe(0);
});
