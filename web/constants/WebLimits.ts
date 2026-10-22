export const WEB_LIMITS = {
  NOW_TICK_INTERVAL_MILLISECONDS:         15_000,
  STREAM_RETRY_DELAY_MILLISECONDS:        3_000,
  MAXIMUM_SHOWN_ACTIVE_ROWS:              4,
  /** The agent-progress CLI's bounds on a project's concurrency limit, in agents, mirrored from the server's. */
  MINIMUM_CONCURRENCY_LIMIT:              1,
  MAXIMUM_CONCURRENCY_LIMIT:              10,
  /** How long a stepper stays busy after an accepted limit waiting for a snapshot that carries it. */
  CONCURRENCY_SNAPSHOT_WAIT_MILLISECONDS: 4_000,
  /** The age below which an update reads "just now" rather than its seconds. */
  JUST_NOW_THRESHOLD_SECONDS:             30,
} as const;
