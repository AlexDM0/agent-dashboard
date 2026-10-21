import { useEffect, useState } from 'react';
import { WEB_LIMITS }          from '../constants/WebLimits.ts';

/** The current instant, refreshed on a slow tick: it only feeds the relative ages on screen. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), WEB_LIMITS.NOW_TICK_INTERVAL_MILLISECONDS);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}
