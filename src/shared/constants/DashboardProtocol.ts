/** The server's own routes that a client calls: the CLI's identity and shutdown, and the page's concurrency change. */
export const DASHBOARD_PROTOCOL = {
  IDENTITY_PATH:                     '/api/identity',
  SHUTDOWN_PATH:                     '/api/shutdown',
  /** A header a cross-site form cannot send, so a page elsewhere cannot stop the server. */
  SHUTDOWN_HEADER_NAME:              'X-Agent-Dashboard-Shutdown',
  SHUTDOWN_HEADER_VALUE:             '1',
  SHUTDOWN_ACCEPTED_STATUS:          202,
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`. */
  PROJECTS_API_PATH:                 '/api/projects',
  CONCURRENCY_PATH_SUFFIX:           '/concurrency',
  /** `POST <PROJECTS_API_PATH>/<trackerId><DISPATCHER_PATH_SUFFIX>` with `{ "state": "stopped" }`. */
  DISPATCHER_PATH_SUFFIX:            '/dispatcher',
  /** `POST <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_REQUESTS_PATH_SUFFIX>` with an `OrchestratorRequest`. */
  ORCHESTRATOR_REQUESTS_PATH_SUFFIX: '/orchestrator-requests',
  /** `POST` (an `OrchestratorStartRequest`) or `DELETE <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_PATH_SUFFIX>`. */
  ORCHESTRATOR_PATH_SUFFIX:          '/orchestrator',
  /** Answers the `LaunchToken` an orchestrator start or stop carries in `LAUNCH_TOKEN_HEADER_NAME`. */
  LAUNCH_TOKEN_PATH:                 '/api/launch-token',
  LAUNCH_TOKEN_HEADER_NAME:          'X-Agent-Dashboard-Launch-Token',
  /** The command word the server runs a supervisor with; not in `help`. */
  SUPERVISE_COMMAND:                 'supervise',
  /** The board origin listens this many ports above the dashboard's, so a fixed `--port` fixes both. */
  BOARD_PORT_OFFSET:                 1,
  /** On the board origin: the hidden page carrying the theme and Esc across, and its script. */
  BOARD_BRIDGE_PATH:                 '/bridge',
  BOARD_BRIDGE_SCRIPT_PATH:          '/bridge.js',
} as const;
