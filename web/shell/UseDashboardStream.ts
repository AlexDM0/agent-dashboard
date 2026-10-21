import { useEffect, useState }    from 'react';
import type { DashboardSnapshot } from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS }    from '../constants/DashboardEndpoints.ts';
import { WEB_LIMITS }             from '../constants/WebLimits.ts';

export type StreamConnection = 'connecting' | 'live' | 'reconnecting';

export interface DashboardStream {
  snapshot:     DashboardSnapshot | null;
  connection:   StreamConnection;
  lastUpdateAt: number | null;
}

const INITIAL_STREAM: DashboardStream = { snapshot: null, connection: 'connecting', lastUpdateAt: null };

/**
 * The live snapshot: one fetch for a quick first paint, then the event stream. The browser retries a dropped stream
 * itself; a stream it gave up on (closed) is opened again after a pause.
 */
export function useDashboardStream(): DashboardStream {
  const [stream, setStream] = useState<DashboardStream>(INITIAL_STREAM);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let retryTimeout: number | undefined;
    let unmounted = false;

    const receive = (snapshot: DashboardSnapshot): void => {
      setStream({ snapshot, connection: 'live', lastUpdateAt: Date.now() });
    };

    const connect = (): void => {
      const source = new EventSource(DASHBOARD_ENDPOINTS.EVENTS_PATH);
      eventSource = source;
      source.addEventListener(DASHBOARD_ENDPOINTS.SNAPSHOT_EVENT_NAME, (event) => {
        receive(JSON.parse(String(event.data)) as DashboardSnapshot);
      });
      source.addEventListener('error', () => {
        setStream((previous) => ({ ...previous, connection: previous.snapshot === null ? 'connecting' : 'reconnecting' }));
        if (source.readyState === EventSource.CLOSED && !unmounted) {
          source.close();
          retryTimeout = window.setTimeout(connect, WEB_LIMITS.STREAM_RETRY_DELAY_MILLISECONDS);
        }
      });
    };

    fetch(DASHBOARD_ENDPOINTS.SNAPSHOT_PATH)
      .then(async (response) => (response.ok ? (await response.json()) as DashboardSnapshot : null))
      .then((snapshot) => {
        if (snapshot !== null && !unmounted) {
          setStream((previous) => (previous.snapshot === null ? { snapshot, connection: previous.connection, lastUpdateAt: Date.now() } : previous));
        }
      })
      .catch(() => undefined);
    connect();

    return () => {
      unmounted = true;
      eventSource?.close();
      window.clearTimeout(retryTimeout);
    };
  }, []);

  return stream;
}
