/** The server's own routes that a client calls: the CLI's identity and shutdown, and the page's concurrency change. */
export const DASHBOARD_PROTOCOL = {
  IDENTITY_PATH:            '/api/identity',
  SHUTDOWN_PATH:            '/api/shutdown',
  /** A header a cross-site form cannot send, so a page elsewhere cannot stop the server. */
  SHUTDOWN_HEADER_NAME:     'X-Agent-Dashboard-Shutdown',
  SHUTDOWN_HEADER_VALUE:    '1',
  SHUTDOWN_ACCEPTED_STATUS: 202,
  /** `POST <PROJECTS_API_PATH>/<trackerId><CONCURRENCY_PATH_SUFFIX>` with `{ "limit": <n> }`. */
  PROJECTS_API_PATH:        '/api/projects',
  CONCURRENCY_PATH_SUFFIX:  '/concurrency',
} as const;
