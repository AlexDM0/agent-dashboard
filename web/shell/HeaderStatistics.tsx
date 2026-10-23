import type { HeaderTotals }    from './HeaderTotals.ts';
import { HeaderTotalsLineUtil } from './HeaderTotalsLineUtil.ts';

interface HeaderStatisticsProperties {
  totals:                    HeaderTotals;
  /** Null until the first snapshot arrives. */
  machineParallelAgentLimit: number | null;
  orchestratorCount:         number;
}

export function HeaderStatistics({ totals, machineParallelAgentLimit, orchestratorCount }: HeaderStatisticsProperties) {
  return <p className="mono muted ap-header-totals">{HeaderTotalsLineUtil.lineOf(totals, machineParallelAgentLimit, orchestratorCount)}</p>;
}
