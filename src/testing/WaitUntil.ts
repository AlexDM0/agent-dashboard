/** Polls a condition the code under test reaches asynchronously, failing with the description once the wait runs out. Test-only. */
const POLL_INTERVAL_MILLISECONDS = 10;
const DEFAULT_WAIT_MILLISECONDS  = 3_000;

export async function waitUntil(condition: () => boolean, description: string, waitMilliseconds = DEFAULT_WAIT_MILLISECONDS): Promise<void> {
  const deadline = performance.now() + waitMilliseconds;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting until ${description}`);
    await Bun.sleep(POLL_INTERVAL_MILLISECONDS);
  }
}
