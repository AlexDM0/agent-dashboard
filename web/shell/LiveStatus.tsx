import { TimeUtil }              from '../time/TimeUtil.ts';
import type { StreamConnection } from './UseDashboardStream.ts';

interface LiveStatusProperties {
  connection:   StreamConnection;
  lastUpdateAt: number | null;
  now:          number;
}

export function LiveStatus({ connection, lastUpdateAt, now }: LiveStatusProperties) {
  const isLive = connection === 'live';
  return (
    <div className="ap-status-line" data-freshness={isLive ? 'live' : 'snapshot'}>
      <span className="ap-status-dot" aria-hidden="true" />
      {/* Only the connection is announced: the age below changes on every tick. */}
      <span className="ap-status-label" role="status">{connection}</span>
      {isLive && lastUpdateAt !== null ? <span>· updated {TimeUtil.agoPhraseOfInstant(lastUpdateAt, now)}</span> : null}
    </div>
  );
}
