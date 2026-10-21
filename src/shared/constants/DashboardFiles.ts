/** The names of the registry agent-progress writes and of the dashboard's own files beside it. */
export const DASHBOARD_FILES = {
  REGISTRY_DIRECTORY_NAME:    '.agent-progress-monitor',
  REGISTRY_FILE_NAME:         'projects.json',
  DASHBOARD_DIRECTORY_NAME:   'agent-dashboard',
  SERVER_RECORD_FILE_NAME:    'server.json',
  SERVER_LOG_FILE_NAME:       'server.log',
  PAGE_FILE_NAME:             'progress.html',
  STAMP_FILE_NAME:            'progress.stamp.js',
  SUPPORTED_REGISTRY_VERSION: 1,
} as const;
