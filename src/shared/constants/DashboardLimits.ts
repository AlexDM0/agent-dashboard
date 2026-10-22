export const DASHBOARD_LIMITS = {
  DEFAULT_PORT:                           4710,
  REFRESH_QUIET_MILLISECONDS:             250,
  REFRESH_MAXIMUM_WAIT_MILLISECONDS:      2_000,
  SAFETY_SWEEP_INTERVAL_MILLISECONDS:     60_000,
  HEARTBEAT_INTERVAL_MILLISECONDS:        25_000,
  SERVER_START_TIMEOUT_MILLISECONDS:      5_000,
  STATUS_READ_TIMEOUT_MILLISECONDS:       10_000,
  MAXIMUM_CONCURRENT_STATUS_READS:        4,
  CONCURRENCY_WRITE_TIMEOUT_MILLISECONDS: 10_000,
  DISPATCHER_STOP_TIMEOUT_MILLISECONDS:   10_000,
  /** The agent-progress CLI's own bounds on a project's concurrency limit, in agents. */
  MINIMUM_CONCURRENCY_LIMIT:              1,
  MAXIMUM_CONCURRENCY_LIMIT:              10,
  RECENT_LOG_LINE_COUNT:                  5,
  /** The most tickets one clear-low-tickets request may name. */
  MAXIMUM_CLEARED_TICKET_COUNT:           50,
  /** Bounds connecting to, and writing one line into, a Claude Code session's messaging socket. */
  SESSION_SOCKET_TIMEOUT_MILLISECONDS:    2_000,
  /** How long a start waits for a new supervisor's socket to accept. */
  SUPERVISOR_START_TIMEOUT_MILLISECONDS:  10_000,
  /** How long a supervisor waits, after closing its session's stdin on Stop, before it sends SIGTERM. */
  SESSION_STOP_GRACE_MILLISECONDS:        10_000,
  /** How long a handoff waits for the running session's note, its one complete reply, before it refuses and starts nothing. */
  HANDOFF_REPLY_TIMEOUT_MILLISECONDS:     180_000,
  /** How long a handoff waits, once it has the note, for the stopped session to end: past the stop grace, by a margin. */
  HANDOFF_END_TIMEOUT_MILLISECONDS:       15_000,
  /** How often a dropped supervisor connection is retried while its record lives. */
  SUPERVISOR_RECONNECT_MILLISECONDS:      5_000,
  /** macOS keeps 104 bytes for a Unix socket path, its terminating zero among them. */
  MAXIMUM_SOCKET_PATH_BYTES:              103,
  /** The chat messages a supervisor holds and a conversation stream replays on connect. */
  CONVERSATION_HISTORY_MESSAGE_COUNT:     200,
  /** The longest chat message, in characters after trimming. */
  MAXIMUM_CHAT_TEXT_CHARACTERS:           20_000,
  /** How much of a watched session's transcript end is read for its context usage, so no snapshot waits on a large file. */
  TRANSCRIPT_TAIL_BYTES:                  262_144,
} as const;
