export const COMMAND_LINE_LIMITS = {
  IDENTITY_PROBE_TIMEOUT_MILLISECONDS:   1_000,
  SERVER_POLL_INTERVAL_MILLISECONDS:     100,
  SERVER_STOP_TIMEOUT_MILLISECONDS:      5_000,
  SHUTDOWN_REQUEST_TIMEOUT_MILLISECONDS: 2_000,
  LOWEST_PORT:                           1,
  /** One below the highest TCP port, since the board origin listens on the port above the dashboard's. */
  HIGHEST_PORT:                          65_534,
} as const;
