import type { OrchestratorSession }                            from '../../src/shared/DashboardContract.ts';
import { PopoverMenu, type PopoverMenuAction }                 from '../menu/PopoverMenu.tsx';
import { type OrchestratorMenuActionId, OrchestratorMenuUtil } from './OrchestratorMenuUtil.ts';
import { handOffOrchestrator, stopOrchestrator }               from './OrchestratorSessionDelivery.ts';
import type { SessionRequest }                                 from './UseSessionRequest.ts';

interface OrchestratorMenuProperties {
  trackerId:      string;
  session:        OrchestratorSession;
  refreshRequest: SessionRequest;
  stopRequest:    SessionRequest;
}

/** The session card's menu, left of its name; a request's progress and refusal show beside the session, so the panel closes once it is sent. */
export function OrchestratorMenu({
  trackerId, session, refreshRequest, stopRequest
}: OrchestratorMenuProperties) {
  const requestsByAction: Record<OrchestratorMenuActionId, () => Promise<boolean>> = {
    refresh: () => refreshRequest.send(() => handOffOrchestrator(trackerId)),
    stop:    () => stopRequest.send(() => stopOrchestrator(trackerId)),
  };
  const actions: PopoverMenuAction[] = OrchestratorMenuUtil.entriesOf(session.context).map((entry) => ({
    ...entry,
    run: async () => {
      await requestsByAction[entry.id]();
      return { kind: 'done' };
    },
  }));
  return <PopoverMenu label="Orchestrator menu" actions={actions} hasWarning={OrchestratorMenuUtil.hasWarningOf(session.context)} />;
}
