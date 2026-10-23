import type { OrchestratorSession, SessionRole } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }               from './OrchestratorSessionUtil.ts';

interface SessionGlyphProperties {
  role:    SessionRole;
  session: OrchestratorSession | null;
}

/** A session as its role's mark in its state's colour, dashed when watched; without a session the slot keeps its width, empty. */
export function SessionGlyph({ role, session }: SessionGlyphProperties) {
  if (session === null) return <span className="ap-session-glyph" data-empty="true" aria-hidden="true" />;
  const hoverText = OrchestratorSessionUtil.hoverTextOf(session, role);
  return (
    <span
      className="ap-session-glyph"
      data-role={role}
      data-state={OrchestratorSessionUtil.statePaletteOf(session.state, role)}
      data-watched={session.ownership === 'watched'}
      role="img"
      aria-label={hoverText}
      title={hoverText}
    >
      {OrchestratorSessionUtil.markOf(role)}
    </span>
  );
}
