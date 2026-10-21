/**
 * Runs one asynchronous job after a quiet period with no triggers, never two runs at once: triggers during the quiet
 * period restart it, up to a maximum wait from the first of them, and any number of triggers during a run schedule
 * exactly one more run after it.
 */

export interface CoalescingRunnerOptions {
  run:                     () => Promise<void>;
  quietMilliseconds:       number;
  /** How long a pending run may be put off by triggers that keep arriving within the quiet period. */
  maximumWaitMilliseconds: number;
  /** Told about a run that rejected; the runner carries on either way. */
  runFailed?:              (error: unknown) => void;
}

export interface CoalescingRunner {
  /** Schedules a run after the quiet period, or one more after the current run. */
  trigger(): void;
  /** Runs now, skipping the quiet period, and resolves once a run that started after this call has finished. */
  runNow(): Promise<void>;
  /** Cancels what is scheduled, refuses further triggers, and resolves once the current run, if any, has finished. */
  stop(): Promise<void>;
}

export function createCoalescingRunner(options: CoalescingRunnerOptions): CoalescingRunner {
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let maximumWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let currentRun: Promise<void> | null = null;
  let anotherRunIsDue = false;
  let stopped = false;
  let waitersForTheNextRun: (() => void)[] = [];

  function cancelScheduledRun(): void {
    if (quietTimer !== null) clearTimeout(quietTimer);
    if (maximumWaitTimer !== null) clearTimeout(maximumWaitTimer);
    quietTimer = null;
    maximumWaitTimer = null;
  }

  function startScheduledRun(): void {
    cancelScheduledRun();
    startRun();
  }

  function scheduleAfterQuietPeriod(): void {
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = setTimeout(startScheduledRun, options.quietMilliseconds);
    maximumWaitTimer ??= setTimeout(startScheduledRun, options.maximumWaitMilliseconds);
  }

  function startRun(): void {
    const waitersForThisRun = waitersForTheNextRun;
    waitersForTheNextRun = [];
    currentRun = (async () => {
      try {
        await options.run();
      } catch (error) {
        options.runFailed?.(error);
      } finally {
        currentRun = null;
        for (const resolveWaiter of waitersForThisRun) resolveWaiter();
        afterRun();
      }
    })();
  }

  function afterRun(): void {
    if (stopped || !anotherRunIsDue) return;
    anotherRunIsDue = false;
    if (waitersForTheNextRun.length > 0) startRun();
    else scheduleAfterQuietPeriod();
  }

  return {
    trigger() {
      if (stopped) return;
      if (currentRun !== null) anotherRunIsDue = true;
      else scheduleAfterQuietPeriod();
    },

    runNow() {
      if (stopped) return Promise.resolve();
      const finished = new Promise<void>((resolve) => waitersForTheNextRun.push(resolve));
      if (currentRun !== null) {
        anotherRunIsDue = true;
      } else {
        startScheduledRun();
      }
      return finished;
    },

    async stop() {
      stopped = true;
      cancelScheduledRun();
      for (const resolveWaiter of waitersForTheNextRun.splice(0)) resolveWaiter();
      if (currentRun !== null) await currentRun;
    },
  };
}
