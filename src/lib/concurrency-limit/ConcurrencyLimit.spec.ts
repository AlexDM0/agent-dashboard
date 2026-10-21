/**
 * The limit is what keeps a machine with many projects from spawning a status read per project at once: the count in
 * flight never exceeds the maximum, waiting tasks start in arrival order, and a failing task frees its slot.
 */
import { expect, test } from 'bun:test';

import { createConcurrencyLimit } from './ConcurrencyLimit.ts';

const TASK_MILLISECONDS = 15;

test('never more tasks in flight than the maximum, and every task runs, in arrival order', async () => {
  const limit = createConcurrencyLimit(2);
  let tasksInFlight = 0;
  let mostTasksInFlight = 0;
  const startOrder: number[] = [];
  const results = await Promise.all([0, 1, 2, 3, 4].map((taskNumber) => limit.run(async () => {
    startOrder.push(taskNumber);
    tasksInFlight++;
    mostTasksInFlight = Math.max(mostTasksInFlight, tasksInFlight);
    await Bun.sleep(TASK_MILLISECONDS);
    tasksInFlight--;
    return taskNumber * 10;
  })));
  expect(results).toEqual([0, 10, 20, 30, 40]);
  expect(mostTasksInFlight).toBe(2);
  expect(startOrder).toEqual([0, 1, 2, 3, 4]);
});

test('a failing task passes its rejection on and frees its slot', async () => {
  const limit = createConcurrencyLimit(1);
  const failing = limit.run(async () => {
    throw new Error('Example failure');
  });
  await expect(failing).rejects.toThrow('Example failure');
  expect(await limit.run(async () => 'next')).toBe('next');
});
