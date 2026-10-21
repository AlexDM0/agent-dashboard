/** Runs asynchronous tasks with at most a given number in flight; the rest wait in the order they arrived. */

export interface ConcurrencyLimit {
  run<Result>(task: () => Promise<Result>): Promise<Result>;
}

export function createConcurrencyLimit(maximumInFlight: number): ConcurrencyLimit {
  let tasksInFlight = 0;
  const waitingStarts: (() => void)[] = [];

  async function slotTaken(): Promise<void> {
    if (tasksInFlight < maximumInFlight) {
      tasksInFlight++;
      return;
    }
    // The slot passes straight from the finishing task to this one, so the count never dips in between.
    await new Promise<void>((resolve) => waitingStarts.push(resolve));
  }

  function slotReleased(): void {
    const nextStart = waitingStarts.shift();
    if (nextStart === undefined) tasksInFlight--;
    else nextStart();
  }

  return {
    async run(task) {
      await slotTaken();
      try {
        return await task();
      } finally {
        slotReleased();
      }
    },
  };
}
