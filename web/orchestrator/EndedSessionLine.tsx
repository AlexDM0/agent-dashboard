import { useState }                              from 'react';
import type { OrchestratorSession, SessionRole } from '../../src/shared/DashboardContract.ts';
import { EndedSessionSplitUtil }                 from './EndedSessionSplitUtil.ts';
import { OrchestratorSessionUtil }               from './OrchestratorSessionUtil.ts';
import { SessionCard }                           from './SessionCard.tsx';

interface EndedSessionLineProperties {
  role:      SessionRole;
  trackerId: string;
  session:   OrchestratorSession;
}

/** One ended session in the drawer's fold, closed; opened, its card read-only, its stream tailed only while open. */
export function EndedSessionLine({ role, trackerId, session }: EndedSessionLineProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const sessionName = OrchestratorSessionUtil.nameOf(session, role);
  return (
    <details className="ap-ended-line" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary className="ap-ended-line-summary">
        <span className="ap-ended-line-name ellipsis" title={sessionName}>{sessionName}</span>
        <span className="mono muted ap-ended-line-times">{EndedSessionSplitUtil.endedLineOf(session)}</span>
      </summary>
      {isOpen ? <SessionCard role={role} trackerId={trackerId} session={session} isReadOnly /> : null}
    </details>
  );
}
