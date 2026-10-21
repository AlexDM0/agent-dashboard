export const WEB_LIMITS = {
  NOW_TICK_INTERVAL_MILLISECONDS:  15_000,
  STREAM_RETRY_DELAY_MILLISECONDS: 3_000,
  MAXIMUM_SHOWN_ACTIVE_ROWS:       4,
  /** The agent-progress CLI's bounds on a project's concurrency limit, in agents, mirrored from the server's. */
  MINIMUM_CONCURRENCY_LIMIT:       1,
  MAXIMUM_CONCURRENCY_LIMIT:       10,
} as const;
