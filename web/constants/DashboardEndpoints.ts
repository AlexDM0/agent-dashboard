export const DASHBOARD_ENDPOINTS = {
  SNAPSHOT_PATH:                     '/api/snapshot',
  EVENTS_PATH:                       '/api/events',
  SNAPSHOT_EVENT_NAME:               'snapshot',
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`, mirroring the server's protocol. */
  PROJECTS_API_PATH:                 '/api/projects',
  CONCURRENCY_PATH_SUFFIX:           '/concurrency',
  /** `POST <PROJECTS_API_PATH>/<trackerId><DISPATCHER_PATH_SUFFIX>` with `{ "state": "stopped" }`. */
  DISPATCHER_PATH_SUFFIX:            '/dispatcher',
  /** `POST <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_REQUESTS_PATH_SUFFIX>` with an `OrchestratorRequest`. */
  ORCHESTRATOR_REQUESTS_PATH_SUFFIX: '/orchestrator-requests',
  /** `POST` an `OrchestratorStartRequest` or `DELETE <PROJECTS_API_PATH>/<trackerId><ORCHESTRATOR_PATH_SUFFIX>`, carrying the launch token. */
  ORCHESTRATOR_PATH_SUFFIX:          '/orchestrator',
  ORCHESTRATOR_MESSAGES_PATH_SUFFIX: '/orchestrator/messages',
  ORCHESTRATOR_ANSWERS_PATH_SUFFIX:  '/orchestrator/answers',
  /** Server-Sent Events: `history` (every `ChatMessage` so far), then `session` and `message` as they change. */
  ORCHESTRATOR_EVENTS_PATH_SUFFIX:   '/orchestrator/events',
  /** `POST`, no body, carrying the launch token: hands the board to a fresh dashboard-owned session. */
  ORCHESTRATOR_HANDOFF_PATH_SUFFIX:  '/orchestrator/handoff',
  ORCHESTRATOR_HISTORY_EVENT_NAME:   'history',
  ORCHESTRATOR_MESSAGE_EVENT_NAME:   'message',
  /** Answers the `LaunchToken` every orchestrator start, stop, chat and answer carries in `LAUNCH_TOKEN_HEADER_NAME`. */
  LAUNCH_TOKEN_PATH:                 '/api/launch-token',
  LAUNCH_TOKEN_HEADER_NAME:          'X-Agent-Dashboard-Launch-Token',
  /** `POST`, no body, with `RESTART_HEADER_NAME`: the server hands its port to a fresh server and the stream reconnects. */
  RESTART_PATH:                      '/api/restart',
  RESTART_HEADER_NAME:               'X-Agent-Dashboard-Restart',
  RESTART_HEADER_VALUE:              '1',
} as const;
