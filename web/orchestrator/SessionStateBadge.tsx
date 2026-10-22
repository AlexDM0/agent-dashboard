import type { OrchestratorSession } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }  from './OrchestratorSessionUtil.ts';

interface SessionStateBadgeProperties {
  session: OrchestratorSession;
}

/** The session's state, and for a watched one a second pill saying so, since its questions are answered elsewhere. */
export function SessionStateBadge({ session }: SessionStateBadgeProperties) {
  return (
    <>
      <span className="ap-pill" data-state={OrchestratorSessionUtil.statePaletteOf(session.state)}>{OrchestratorSessionUtil.stateWordOf(session.state)}</span>
      {session.ownership === 'watched' ? <span className="ap-pill">watched</span> : null}
    </>
  );
}
