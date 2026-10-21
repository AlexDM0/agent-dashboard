/**
 * The runner's three promises are what the monitor relies on: a burst of triggers is one run after the quiet period,
 * runs never overlap, and any number of triggers during a run is exactly one more run; triggers that never let the
 * quiet period end still run it once the maximum wait is up. `runNow` skips the quiet period
 * and waits for a fresh run; `stop` leaves nothing scheduled. Real timers with a short quiet period keep it honest.
 */
import { expect, test } from 'bun:test';

import { createCoalescingRunner } from './CoalescingRunner.ts';

const QUIET_MILLISECONDS = 20;
const SETTLE_MILLISECONDS = 80;
const LONG_WAIT_MILLISECONDS = 60_000;
const MAXIMUM_WAIT_MILLISECONDS = 100;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('a burst of triggers is one run, after the quiet period', async () => {
  let runCount = 0;
  const runner = createCoalescingRunner({ quietMilliseconds: QUIET_MILLISECONDS, maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS, run: async () => { runCount++; } });
  runner.trigger();
  runner.trigger();
  await Bun.sleep(QUIET_MILLISECONDS / 2);
  runner.trigger();
  expect(runCount, 'nothing runs inside the quiet period').toBe(0);
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount).toBe(1);
  await runner.stop();
});

test('triggers that keep arriving inside the quiet period put a run off no longer than the maximum wait', async () => {
  let runCount = 0;
  const runner = createCoalescingRunner({ quietMilliseconds: QUIET_MILLISECONDS, maximumWaitMilliseconds: MAXIMUM_WAIT_MILLISECONDS, run: async () => { runCount++; } });
  const startedAt = performance.now();
  while (runCount === 0 && performance.now() - startedAt < SETTLE_MILLISECONDS * 10) {
    runner.trigger();
    await Bun.sleep(QUIET_MILLISECONDS / 4);
  }
  expect(runCount).toBe(1);
  expect(performance.now() - startedAt).toBeLessThan(MAXIMUM_WAIT_MILLISECONDS + SETTLE_MILLISECONDS);
  await runner.stop();
});

test('triggers during a run schedule exactly one more run, and runs never overlap', async () => {
  let runCount = 0;
  let runsInFlight = 0;
  let mostRunsInFlight = 0;
  const firstRunGate = deferred();
  const runner = createCoalescingRunner({
    quietMilliseconds:       QUIET_MILLISECONDS,
    maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS,
    run:                     async () => {
      runCount++;
      runsInFlight++;
      mostRunsInFlight = Math.max(mostRunsInFlight, runsInFlight);
      if (runCount === 1) await firstRunGate.promise;
      runsInFlight--;
    },
  });
  runner.trigger();
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount, 'the first run is under way').toBe(1);
  runner.trigger();
  runner.trigger();
  runner.trigger();
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount, 'the second run waits for the first').toBe(1);
  firstRunGate.resolve();
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount).toBe(2);
  expect(mostRunsInFlight).toBe(1);
  await runner.stop();
});

test('runNow skips the quiet period and resolves after its run', async () => {
  let runCount = 0;
  const runner = createCoalescingRunner({ quietMilliseconds: SETTLE_MILLISECONDS * 10, maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS, run: async () => { runCount++; } });
  runner.trigger();
  await runner.runNow();
  expect(runCount).toBe(1);
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount, 'the cancelled quiet period runs nothing more').toBe(1);
  await runner.stop();
});

test('runNow during a run waits for a fresh run that started after it', async () => {
  const observedValues: number[] = [];
  let value = 0;
  const firstRunGate = deferred();
  let runCount = 0;
  const runner = createCoalescingRunner({
    quietMilliseconds:       QUIET_MILLISECONDS,
    maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS,
    run:                     async () => {
      runCount++;
      const seen = value;
      if (runCount === 1) await firstRunGate.promise;
      observedValues.push(seen);
    },
  });
  const firstRun = runner.runNow();
  value = 1;
  const secondRun = runner.runNow();
  firstRunGate.resolve();
  await firstRun;
  await secondRun;
  expect(observedValues).toEqual([0, 1]);
  await runner.stop();
});

test('a rejected run is reported and the runner keeps running', async () => {
  const failures: unknown[] = [];
  let runCount = 0;
  const runner = createCoalescingRunner({
    quietMilliseconds:       QUIET_MILLISECONDS,
    maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS,
    run:                     async () => {
      runCount++;
      if (runCount === 1) throw new Error('Example failure');
    },
    runFailed: (error) => failures.push(error),
  });
  await runner.runNow();
  await runner.runNow();
  expect(runCount).toBe(2);
  expect(failures.map((failure) => (failure as Error).message)).toEqual(['Example failure']);
  await runner.stop();
});

test('stop cancels a scheduled run, waits for the current one and refuses later triggers', async () => {
  let runCount = 0;
  const gate = deferred();
  let runFinished = false;
  const runner = createCoalescingRunner({
    quietMilliseconds:       QUIET_MILLISECONDS,
    maximumWaitMilliseconds: LONG_WAIT_MILLISECONDS,
    run:                     async () => {
      runCount++;
      await gate.promise;
      runFinished = true;
    },
  });
  void runner.runNow();
  runner.trigger();
  const stopped = runner.stop();
  gate.resolve();
  await stopped;
  expect(runFinished, 'stop waited for the run in flight').toBe(true);
  runner.trigger();
  await runner.runNow();
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(runCount).toBe(1);
});
