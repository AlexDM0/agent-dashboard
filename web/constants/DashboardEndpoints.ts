export const DASHBOARD_ENDPOINTS = {
  SNAPSHOT_PATH:           '/api/snapshot',
  EVENTS_PATH:             '/api/events',
  SNAPSHOT_EVENT_NAME:     'snapshot',
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`, mirroring the server's protocol. */
  PROJECTS_API_PATH:       '/api/projects',
  CONCURRENCY_PATH_SUFFIX: '/concurrency',
} as const;
