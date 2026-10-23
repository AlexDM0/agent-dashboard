import type { OrchestratorSession, SessionRole }               from '../../src/shared/DashboardContract.ts';
import { PopoverMenu, type PopoverMenuAction }                 from '../menu/PopoverMenu.tsx';
import { type OrchestratorMenuActionId, OrchestratorMenuUtil } from './OrchestratorMenuUtil.ts';
import { handOffOrchestrator, stopSession }                    from './OrchestratorSessionDelivery.ts';
import type { SessionRequest }                                 from './UseSessionRequest.ts';

interface OrchestratorMenuProperties {
  role:           SessionRole;
  trackerId:      string;
  session:        OrchestratorSession;
  refreshRequest: SessionRequest;
  stopRequest:    SessionRequest;
}

const MENU_LABELS: Record<SessionRole, string> = { 'orchestrator': 'Orchestrator menu', 'product-owner': 'Product owner menu' };

/** The session card's menu, left of its name; a request's progress and refusal show beside the session, so the panel closes once it is sent. */
export function OrchestratorMenu({
  role, trackerId, session, refreshRequest, stopRequest
}: OrchestratorMenuProperties) {
  const requestsByAction: Record<OrchestratorMenuActionId, () => Promise<boolean>> = {
    refresh: () => refreshRequest.send(() => handOffOrchestrator(trackerId)),
    stop:    () => stopRequest.send(() => stopSession(role, trackerId)),
  };
  const entries = role === 'orchestrator' ? OrchestratorMenuUtil.entriesOf(session.context) : OrchestratorMenuUtil.productOwnerEntriesOf();
  const actions: PopoverMenuAction[] = entries.map((entry) => ({
    ...entry,
    run: () => {
      void requestsByAction[entry.id]();
      return Promise.resolve({ kind: 'done' });
    },
  }));
  const hasWarning = role === 'orchestrator' && OrchestratorMenuUtil.hasWarningOf(session.context);
  return <PopoverMenu label={MENU_LABELS[role]} actions={actions} hasWarning={hasWarning} />;
}
