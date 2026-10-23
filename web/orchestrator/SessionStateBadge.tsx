import type { OrchestratorSession, SessionRole } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }               from './OrchestratorSessionUtil.ts';

interface SessionStateBadgeProperties {
  role:    SessionRole;
  session: OrchestratorSession;
}

/** The session's state in its role's colour, and for a watched one a second pill saying so, since its questions are answered elsewhere. */
export function SessionStateBadge({ role, session }: SessionStateBadgeProperties) {
  return (
    <>
      <span className="ap-pill" data-state={OrchestratorSessionUtil.statePaletteOf(session.state, role)}>{OrchestratorSessionUtil.stateWordOf(session.state)}</span>
      {session.ownership === 'watched' ? <span className="ap-pill">watched</span> : null}
    </>
  );
}
