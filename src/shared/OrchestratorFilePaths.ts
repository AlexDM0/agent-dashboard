/**
 * Where a project's dashboard-owned session of a role keeps its record, socket, history and log, named by a hash of the
 * role, the tracker id and, for a role a project runs several of, the launch id, so the name stays as short as the
 * socket path needs.
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

/** A null `launchId` gives the one name of the role and tracker, which a supervisor started before launch ids also used. */
export function orchestratorFilePathsOf(orchestratorDirectory: string, trackerId: string, role: SessionRole, launchId: string | null = null): OrchestratorFilePaths {
  const keyText = launchId === null ? `${role}\n${trackerId}` : `${role}\n${trackerId}\n${launchId}`;
  const key = createHash('sha256').update(keyText).digest('hex').slice(0, DASHBOARD_FILES.ORCHESTRATOR_KEY_HEX_DIGITS);
  return {
    recordPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_RECORD_SUFFIX}`),
    socketPath:  join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_SOCKET_SUFFIX}`),
    historyPath: join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_HISTORY_SUFFIX}`),
    logPath:     join(orchestratorDirectory, `${key}${DASHBOARD_FILES.ORCHESTRATOR_LOG_SUFFIX}`),
  };
}
