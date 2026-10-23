/** The server's own routes that a client calls: the CLI's identity and shutdown, and the page's concurrency change. */
export const DASHBOARD_PROTOCOL = {
  IDENTITY_PATH:                      '/api/identity',
  SHUTDOWN_PATH:                      '/api/shutdown',
  /** A header a cross-site form cannot send, so a page elsewhere cannot stop the server. */
  SHUTDOWN_HEADER_NAME:               'X-Agent-Dashboard-Shutdown',
  SHUTDOWN_HEADER_VALUE:              '1',
  SHUTDOWN_ACCEPTED_STATUS:           202,
  /** `POST`, no body, guarded as the shutdown is: the server stops and `serve` starts its successor on the same port. */
  RESTART_PATH:                       '/api/restart',
  RESTART_HEADER_NAME:                'X-Agent-Dashboard-Restart',
  RESTART_HEADER_VALUE:               '1',
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`. */
  PROJECTS_API_PATH:                  '/api/projects',
  CONCURRENCY_PATH_SUFFIX:            '/concurrency',
  /** `POST <PROJECTS_API_PATH>/<trackerId><DISPATCHER_PATH_SUFFIX>` with `{ "state": "stopped" }`. */
  DISPATCHER_PATH_SUFFIX:             '/dispatcher',
  /** `POST <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_REQUESTS_PATH_SUFFIX>` with an `OrchestratorRequest`. */
  ORCHESTRATOR_REQUESTS_PATH_SUFFIX:  '/orchestrator-requests',
  /** `POST` (an `OrchestratorStartRequest`) or `DELETE <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_PATH_SUFFIX>`. */
  ORCHESTRATOR_PATH_SUFFIX:           '/orchestrator',
  /** `POST` an `OrchestratorChatRequest`, carrying the launch token. */
  ORCHESTRATOR_MESSAGES_PATH_SUFFIX:  '/orchestrator/messages',
  /** `POST` an `OrchestratorAnswerRequest`, carrying the launch token. */
  ORCHESTRATOR_ANSWERS_PATH_SUFFIX:   '/orchestrator/answers',
  /** `GET`: Server-Sent Events of the project's orchestrator conversation and session. */
  ORCHESTRATOR_EVENTS_PATH_SUFFIX:    '/orchestrator/events',
  /** `POST`, no body, carrying the launch token: hands the board to a fresh dashboard-owned session. */
  ORCHESTRATOR_HANDOFF_PATH_SUFFIX:   '/orchestrator/handoff',
  /** `POST` (a `ProductOwnerStartRequest`) or `DELETE <PROJECTS_API_PATH>/<trackerId><PRODUCT_OWNER_PATH_SUFFIX>`. */
  PRODUCT_OWNER_PATH_SUFFIX:          '/product-owner',
  /** `POST` an `OrchestratorChatRequest` to the product owner, carrying the launch token. */
  PRODUCT_OWNER_MESSAGES_PATH_SUFFIX: '/product-owner/messages',
  /** `POST` an `OrchestratorAnswerRequest` to the product owner, carrying the launch token. */
  PRODUCT_OWNER_ANSWERS_PATH_SUFFIX:  '/product-owner/answers',
  /** `GET`: Server-Sent Events of the project's product-owner conversation and session. */
  PRODUCT_OWNER_EVENTS_PATH_SUFFIX:   '/product-owner/events',
  /** Answers the `LaunchToken` an orchestrator start, stop, chat or answer carries in `LAUNCH_TOKEN_HEADER_NAME`. */
  LAUNCH_TOKEN_PATH:                  '/api/launch-token',
  LAUNCH_TOKEN_HEADER_NAME:           'X-Agent-Dashboard-Launch-Token',
  /** The command word the server runs a supervisor with; not in `help`. */
  SUPERVISE_COMMAND:                  'supervise',
  /** The board origin listens this many ports above the dashboard's, so a fixed `--port` fixes both. */
  BOARD_PORT_OFFSET:                  1,
  /** On the board origin: the hidden page carrying the theme and Esc across, and its script. */
  BOARD_BRIDGE_PATH:                  '/bridge',
  BOARD_BRIDGE_SCRIPT_PATH:           '/bridge.js',
} as const;
