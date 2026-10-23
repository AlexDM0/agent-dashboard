import { useEffect, useState }                             from 'react';
import type { DashboardSnapshot }                          from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS }                             from '../constants/DashboardEndpoints.ts';
import { type DashboardEventHub, createDashboardEventHub } from './DashboardEventHub.ts';

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

export interface DashboardStream {
  snapshot:                 DashboardSnapshot | null;
  connection:               StreamConnection;
  lastUpdateAt:             number | null;
  /** Which connection delivered the snapshot: 0 the first-paint fetch, then one more each time the stream opens afresh. */
  snapshotConnectionNumber: number;
}

export interface DashboardConnection {
  stream:   DashboardStream;
  /** The page's one event stream, which each shown conversation subscribes to. */
  eventHub: DashboardEventHub;
}

const INITIAL_STREAM: DashboardStream = {
  snapshot: null, connection: 'connecting', lastUpdateAt: null, snapshotConnectionNumber: 0
};

/**
 * The live snapshot: one fetch for a quick first paint, then the page's one event stream. The browser retries a dropped
 * stream itself; a stream it gave up on (closed) is opened again after a pause. A page being left closes its stream, so
 * a reload never queues behind its own old connection.
 */
export function useDashboardStream(): DashboardConnection {
  const [stream, setStream] = useState<DashboardStream>(INITIAL_STREAM);
  // Made during the first render, so the cards that render beneath it subscribe before its effect connects.
  const [eventHub] = useState(() => createDashboardEventHub({
    openEventSource: (path) => new EventSource(path),
    setTimer:        (task, delayMilliseconds) => window.setTimeout(task, delayMilliseconds),
    clearTimer:      (timer) => window.clearTimeout(timer),
    onSnapshot:      (snapshot, connectionNumber) => setStream({
      snapshot, connection: 'live', lastUpdateAt: Date.now(), snapshotConnectionNumber: connectionNumber
    }),
    onConnectionLost: () => setStream((previous) => ({ ...previous, connection: previous.snapshot === null ? 'connecting' : 'reconnecting' })),
  }));

  useEffect(() => {
    let unmounted = false;
    const disconnectOnPageHide = (): void => eventHub.disconnect();
    // A page restored from the back-forward cache had its stream closed when it was hidden.
    const reconnectOnPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) eventHub.connect();
    };

    fetch(DASHBOARD_ENDPOINTS.SNAPSHOT_PATH)
      .then(async (response) => (response.ok ? (await response.json()) as DashboardSnapshot : null))
      .then((snapshot) => {
        if (snapshot !== null && !unmounted) {
          setStream((previous) => (previous.snapshot === null ? {
            snapshot, connection: previous.connection, lastUpdateAt: Date.now(), snapshotConnectionNumber: 0
          } : previous));
        }
      })
      .catch(() => undefined);
    eventHub.connect();
    window.addEventListener('pagehide', disconnectOnPageHide);
    window.addEventListener('pageshow', reconnectOnPageShow);

    return () => {
      unmounted = true;
      window.removeEventListener('pagehide', disconnectOnPageHide);
      window.removeEventListener('pageshow', reconnectOnPageShow);
      eventHub.disconnect();
    };
  }, [eventHub]);

  return { stream, eventHub };
}
