export const WEB_LIMITS = {
  NOW_TICK_INTERVAL_MILLISECONDS:         15_000,
  STREAM_RETRY_DELAY_MILLISECONDS:        3_000,
  MAXIMUM_SHOWN_ACTIVE_ROWS:              4,
  /** The agent-progress CLI's bounds on a project's concurrency limit, in agents, mirrored from the server's. */
  MINIMUM_CONCURRENCY_LIMIT:              1,
  MAXIMUM_CONCURRENCY_LIMIT:              10,
  /** How long a stepper stays busy after an accepted limit waiting for a snapshot that carries it. */
  CONCURRENCY_SNAPSHOT_WAIT_MILLISECONDS: 4_000,
  /** How long "Sent to the orchestrator" stays beside the button that sent it. */
  ORCHESTRATOR_SENT_NOTE_MILLISECONDS:    4_000,
  /** The age below which an update reads "just now" rather than its seconds. */
  JUST_NOW_THRESHOLD_SECONDS:             30,
  /**
   * The context shares, of the model's window, from which the meter turns amber and then the error colour; from the
   * second a dashboard-owned session's panel warns and highlights Refresh orchestrator. It never acts by itself.
   */
  CONTEXT_WARNING_SHARE:                  0.5,
  CONTEXT_CRITICAL_SHARE:                 0.8,
  /** The most conversation messages a session panel holds; the server sends at most 200 on connect. */
  MAXIMUM_SHOWN_CONVERSATION_MESSAGES:    500,
  /** The characters of a tool call shown on its collapsed line. */
  TOOL_CALL_SUMMARY_CHARACTERS:           120,
} as const;
