/** The names of the registry agent-progress writes and of the dashboard's own files beside it. */
export const DASHBOARD_FILES = {
  REGISTRY_DIRECTORY_NAME:      '.agent-progress-monitor',
  REGISTRY_FILE_NAME:           'projects.json',
  DASHBOARD_DIRECTORY_NAME:     'agent-dashboard',
  SERVER_RECORD_FILE_NAME:      'server.json',
  SERVER_LOG_FILE_NAME:         'server.log',
  ORCHESTRATORS_DIRECTORY_NAME: 'orchestrators',
  ORCHESTRATOR_RECORD_SUFFIX:   '.json',
  ORCHESTRATOR_SOCKET_SUFFIX:   '.sock',
  ORCHESTRATOR_HISTORY_SUFFIX:  '.ndjson',
  ORCHESTRATOR_LOG_SUFFIX:      '.log',
  /** Each handoff note, `<trackerId>-<stamp>.md`, kept beside the orchestrators and never in a tracked repository. */
  HANDOFFS_DIRECTORY_NAME:      'handoffs',
  HANDOFF_NOTE_SUFFIX:          '.md',
  /** Hex digits of the tracker id's SHA-256 naming its orchestrator files, short so the socket path fits. */
  ORCHESTRATOR_KEY_HEX_DIGITS:  16,
  PAGE_FILE_NAME:               'progress.html',
  STAMP_FILE_NAME:              'progress.stamp.js',
  SUPPORTED_REGISTRY_VERSION:   1,
} as const;
