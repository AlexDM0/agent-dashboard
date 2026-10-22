/** Where a project's dashboard-owned orchestrator keeps its record, socket, history and log, named by a tracker id hash. */
import { createHash } from 'node:crypto';
import { join }       from 'node:path';

import { DASHBOARD_FILES } from './constants/DashboardFiles.ts';

export interface OrchestratorFilePaths {
  recordPath:  string;
  socketPath:  string;
  historyPath: string;
  logPath:     string;
}

export function orchestratorDirectoryOf(homeDirectory: string): string {
  return join(homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME, DASHBOARD_FILES.DASHBOARD_DIRECTORY_NAME, DASHBOARD_FILES.ORCHESTRATORS_DIRECTORY_NAME);
}

export function orchestratorFilePathsOf(orchestratorDirectory: string, trackerId: string): OrchestratorFilePaths {
  const key = createHash('sha256').update(trackerId).digest('hex').slice(0, DASHBOARD_FILES.ORCHESTRATOR_KEY_HEX_DIGITS);
  return {
    recordPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_RECORD_SUFFIX}`),
    socketPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_SOCKET_SUFFIX}`),
    historyPath: join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_HISTORY_SUFFIX}`),
    logPath:     join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_LOG_SUFFIX}`),
  };
}
