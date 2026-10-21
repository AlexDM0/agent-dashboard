/** What the CLI and the server agree on: the routes the CLI calls and how a shutdown is asked for and accepted. */
export const DASHBOARD_PROTOCOL = {
  IDENTITY_PATH:            '/api/identity',
  SHUTDOWN_PATH:            '/api/shutdown',
  /** A header a cross-site form cannot send, so a page elsewhere cannot stop the server. */
  SHUTDOWN_HEADER_NAME:     'X-Agent-Dashboard-Shutdown',
  SHUTDOWN_HEADER_VALUE:    '1',
  SHUTDOWN_ACCEPTED_STATUS: 202,
} as const;
