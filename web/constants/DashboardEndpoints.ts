export const DASHBOARD_ENDPOINTS = {
  SNAPSHOT_PATH:                         '/api/snapshot',
  /** The page's one event stream: `snapshot`, and each `?<role>=<trackerId>` conversation's history then messages. */
  EVENTS_PATH:                           '/api/events',
  SNAPSHOT_EVENT_NAME:                   'snapshot',
  CONVERSATION_HISTORY_EVENT_NAME:       'conversation-history',
  CONVERSATION_MESSAGE_EVENT_NAME:       'conversation-message',
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`, mirroring the server's protocol. */
  PROJECTS_API_PATH:                     '/api/projects',
  CONCURRENCY_PATH_SUFFIX:               '/concurrency',
  /** `POST <PROJECTS_API_PATH>/<trackerId><DISPATCHER_PATH_SUFFIX>` with `{ "state": "stopped" }`. */
  DISPATCHER_PATH_SUFFIX:                '/dispatcher',
  /** `POST <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_REQUESTS_PATH_SUFFIX>` with an `OrchestratorRequest`. */
  ORCHESTRATOR_REQUESTS_PATH_SUFFIX:     '/orchestrator-requests',
  /** `POST` an `OrchestratorStartRequest` or `DELETE <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_PATH_SUFFIX>`, carrying the launch token. */
  ORCHESTRATOR_PATH_SUFFIX:              '/orchestrator',
  ORCHESTRATOR_MESSAGES_PATH_SUFFIX:     '/orchestrator/messages',
  ORCHESTRATOR_ANSWERS_PATH_SUFFIX:      '/orchestrator/answers',
  /** `POST`, no body, carrying the launch token: hands the board to a fresh dashboard-owned session. */
  ORCHESTRATOR_HANDOFF_PATH_SUFFIX:      '/orchestrator/handoff',
  /** `POST`, no body, carrying the launch token: stops the dashboard-owned session, then opens it in the Claude desktop app. */
  ORCHESTRATOR_OPEN_IN_APP_PATH_SUFFIX:  '/orchestrator/open-in-app',
  PRODUCT_OWNER_OPEN_IN_APP_PATH_SUFFIX: '/product-owner/open-in-app',
  /** The product owner's routes mirror the orchestrator's: `POST` a `ProductOwnerStartRequest` or `DELETE` the session. */
  PRODUCT_OWNER_PATH_SUFFIX:             '/product-owner',
  PRODUCT_OWNER_MESSAGES_PATH_SUFFIX:    '/product-owner/messages',
  PRODUCT_OWNER_ANSWERS_PATH_SUFFIX:     '/product-owner/answers',
  /** Answers the `LaunchToken` every orchestrator start, stop, chat and answer carries in `LAUNCH_TOKEN_HEADER_NAME`. */
  LAUNCH_TOKEN_PATH:                     '/api/launch-token',
  LAUNCH_TOKEN_HEADER_NAME:              'X-Agent-Dashboard-Launch-Token',
  /** `POST`, no body, with `RESTART_HEADER_NAME`: the server hands its port to a fresh server and the stream reconnects. */
  RESTART_PATH:                          '/api/restart',
  RESTART_HEADER_NAME:                   'X-Agent-Dashboard-Restart',
  RESTART_HEADER_VALUE:                  '1',
} as const;
