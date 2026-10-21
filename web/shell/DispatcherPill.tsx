import type { DispatcherState } from '../../src/shared/DashboardContract.ts';

const PILL_STATES: Record<DispatcherState, 'in-progress' | 'pending' | 'abandoned'> = {
  running:  'in-progress',
  finished: 'pending',
  stopped:  'abandoned',
};

interface DispatcherPillProperties {
  dispatcherState: DispatcherState;
}

export function DispatcherPill({ dispatcherState }: DispatcherPillProperties) {
  return <span className="ap-pill" data-state={PILL_STATES[dispatcherState]} title="Dispatcher">{dispatcherState}</span>;
}
