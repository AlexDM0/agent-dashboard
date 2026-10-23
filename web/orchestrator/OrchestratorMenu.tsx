import type { OrchestratorSession, SessionRole }               from '../../src/shared/DashboardContract.ts';
import { PopoverMenu, type PopoverMenuAction }                 from '../menu/PopoverMenu.tsx';
import { type OrchestratorMenuActionId, OrchestratorMenuUtil } from './OrchestratorMenuUtil.ts';
import { handOffOrchestrator, openSessionInApp, stopSession }  from './OrchestratorSessionDelivery.ts';
import type { SessionRequest }                                 from './UseSessionRequest.ts';

interface OrchestratorMenuProperties {
  role:                SessionRole;
  trackerId:           string;
  session:             OrchestratorSession;
  refreshRequest:      SessionRequest;
  openInAppRequest:    SessionRequest;
  stopRequest:         SessionRequest;
  /** The board's dispatcher runs, so Stop's question says the run stops with the orchestrator. */
  isDispatcherRunning: boolean;
}

const MENU_LABELS: Record<SessionRole, string> = { 'orchestrator': 'Orchestrator menu', 'product-owner': 'Product owner menu' };

/** The session card's menu, left of its name; a request's progress and refusal show beside the session, so the panel closes once it is sent. */
export function OrchestratorMenu({
  role, trackerId, session, refreshRequest, openInAppRequest, stopRequest, isDispatcherRunning
}: OrchestratorMenuProperties) {
  const requestsByAction: Record<OrchestratorMenuActionId, () => Promise<boolean>> = {
    'refresh':     () => refreshRequest.send(() => handOffOrchestrator(trackerId)),
    'open-in-app': () => openInAppRequest.send(() => openSessionInApp(role, trackerId)),
    'stop':        () => stopRequest.send(() => stopSession(role, trackerId)),
  };
  const entries = role === 'orchestrator' ? OrchestratorMenuUtil.entriesOf(session.context, isDispatcherRunning) : OrchestratorMenuUtil.productOwnerEntriesOf();
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
