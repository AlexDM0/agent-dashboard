import { TimeUtil }              from '../time/TimeUtil.ts';
import type { StreamConnection } from './UseDashboardStream.ts';

interface ConnectionBannerProperties {
  connection:   StreamConnection;
  lastUpdateAt: number | null;
  now:          number;
}

export function ConnectionBanner({ connection, lastUpdateAt, now }: ConnectionBannerProperties) {
  if (connection !== 'reconnecting') {
    return null;
  }
  return (
    <div className="ap-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
      <span className="ap-banner-title" role="status">Reconnecting to the dashboard server…</span>
      {lastUpdateAt === null ? null : <span className="mono ap-banner-end">last update {TimeUtil.agoPhraseOfInstant(lastUpdateAt, now)}</span>}
    </div>
  );
}
