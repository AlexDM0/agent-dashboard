import type { HeaderTotals } from './HeaderTotals.ts';

interface HeaderStatisticsProperties {
  totals: HeaderTotals;
}

export function HeaderStatistics({ totals }: HeaderStatisticsProperties) {
  return (
    <dl className="ap-head-stats">
      <div className="ap-stat">
        <dt className="ap-stat-label">Projects</dt>
        <dd className="ap-stat-n">{totals.projectCount}</dd>
      </div>
      <div className="ap-stat">
        <dt className="ap-stat-label">Agents</dt>
        <dd className="ap-stat-n">{totals.agentsInFlight}<small>/{totals.slotCount}</small></dd>
      </div>
      <div className="ap-stat">
        <dt className="ap-stat-label">Ready</dt>
        <dd className="ap-stat-n">{totals.readyCount}</dd>
      </div>
      <div className="ap-stat" {...(totals.reviewWaitingCount > 0 ? { 'data-state': 'in-review' } : {})}>
        <dt className="ap-stat-label">Awaiting review</dt>
        <dd className="ap-stat-n">{totals.reviewWaitingCount}</dd>
      </div>
      <div className="ap-stat" {...(totals.heldCount > 0 ? { 'data-state': 'paused' } : {})}>
        <dt className="ap-stat-label">Held</dt>
        <dd className="ap-stat-n">{totals.heldCount}</dd>
      </div>
    </dl>
  );
}
