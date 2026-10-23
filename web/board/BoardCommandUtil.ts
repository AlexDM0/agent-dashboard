import type { DispatcherState } from '../../src/shared/DashboardContract.ts';

/** The dispatcher actions the board's command bar offers, in the order it shows them. */
export type BoardCommand = 'start-building' | 'include-low-priority' | 'pick-up-low-priority' | 'stop-dispatcher';

/** A stopped or finished board offers a start, a running one a stop; low-priority tickets waiting add their control. */
function commandsOf(dispatcherState: DispatcherState, lowPriorityWaitingCount: number): BoardCommand[] {
  const hasLowPriorityWaiting = lowPriorityWaitingCount > 0;
  if (dispatcherState === 'running') {
    return hasLowPriorityWaiting ? ['pick-up-low-priority', 'stop-dispatcher'] : ['stop-dispatcher'];
  }
  return hasLowPriorityWaiting ? ['start-building', 'include-low-priority'] : ['start-building'];
}

/** Before a run the tickets are included in it; during one they are picked up by it. */
function lowPriorityLabelOf(dispatcherState: DispatcherState, lowPriorityWaitingCount: number): string {
  const verb = dispatcherState === 'running' ? 'Pick up' : 'Include';
  return `${verb} low-priority ${String(lowPriorityWaitingCount)}`;
}

export const BoardCommandUtil = Object.freeze({ commandsOf, lowPriorityLabelOf });
