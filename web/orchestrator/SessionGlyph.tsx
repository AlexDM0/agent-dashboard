import type { OrchestratorSession } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }  from './OrchestratorSessionUtil.ts';

interface SessionGlyphProperties {
  /** The crew member's two-letter mark: `OR` for the orchestrator. */
  mark:    string;
  session: OrchestratorSession | null;
}

/** A session as its mark in its state's colour, dashed when watched; without a session the slot keeps its width, empty. */
export function SessionGlyph({ mark, session }: SessionGlyphProperties) {
  if (session === null) return <span className="ap-session-glyph" data-empty="true" aria-hidden="true" />;
  const hoverText = OrchestratorSessionUtil.hoverTextOf(session);
  return (
    <span
      className="ap-session-glyph"
      data-state={OrchestratorSessionUtil.statePaletteOf(session.state)}
      data-watched={session.ownership === 'watched'}
      role="img"
      aria-label={hoverText}
      title={hoverText}
    >
      {mark}
    </span>
  );
}
