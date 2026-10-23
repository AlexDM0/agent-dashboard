/**
 * Where a project's dashboard-owned session of a role keeps its record, socket, history and log, named by a hash of the
 * role and the tracker id, so the name stays as short as the socket path needs whatever the role.
 */
import { createHash } from 'node:crypto';
import { join }       from 'node:path';

import type { SessionRole } from './DashboardContract.ts';
import { DASHBOARD_FILES }  from './constants/DashboardFiles.ts';

export interface OrchestratorFilePaths {
  recordPath:  string;
  socketPath:  string;
  historyPath: string;
  logPath:     string;
}

export function orchestratorDirectoryOf(homeDirectory: string): string {
  return join(homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME, DASHBOARD_FILES.DASHBOARD_DIRECTORY_NAME, DASHBOARD_FILES.ORCHESTRATORS_DIRECTORY_NAME);
}

export function orchestratorFilePathsOf(orchestratorDirectory: string, trackerId: string, role: SessionRole): OrchestratorFilePaths {
  const key = createHash('sha256').update(`${role}\n${trackerId}`).digest('hex').slice(0, DASHBOARD_FILES.ORCHESTRATOR_KEY_HEX_DIGITS);
  return {
    recordPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_RECORD_SUFFIX}`),
    socketPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_SOCKET_SUFFIX}`),
    historyPath: join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_HISTORY_SUFFIX}`),
    logPath:     join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_LOG_SUFFIX}`),
  };
}
