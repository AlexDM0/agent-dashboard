import type { RefObject }                            from 'react';
import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { useNow }                                    from '../shell/UseNow.ts';
import { TimeUtil }                                  from '../time/TimeUtil.ts';
import { ContextMeter }                              from './ContextMeter.tsx';
import type { CrewDrawerFocus }                      from './CrewDrawer.tsx';
import { OrchestratorSessionUtil }                   from './OrchestratorSessionUtil.ts';
import { SessionGlyph }                              from './SessionGlyph.tsx';
import { StartOrchestratorButton }                   from './StartOrchestratorButton.tsx';

interface CrewStripProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  isDrawerOpen:    boolean;
  drawerId:        string;
  stripReference:  RefObject<HTMLButtonElement | null>;
  onOpenDrawer:    (focus: CrewDrawerFocus) => void;
}

function LastActionLine({ session, now }: { session: OrchestratorSession | null; now: number }) {
  if (session === null) return <span className="muted ap-crew-action">No orchestrator runs in this project</span>;
  if (session.lastAction === null) return <span className="muted ap-crew-action">No action yet</span>;
  return (
    <span className="ap-crew-action" title={session.lastAction.text}>
      <span className="ellipsis">{session.lastAction.text}</span>
      <span className="mono muted ap-crew-action-age">{TimeUtil.agoPhraseOfStamp(session.lastAction.at, now)}</span>
    </span>
  );
}

/** The board's crew in one strip over the frame: the leading orchestrator's state, context and last action; a click opens the drawer. */
export function CrewStrip({
  project, watchedSessions, isDrawerOpen, drawerId, stripReference, onOpenDrawer
}: CrewStripProperties) {
  const now = useNow();
  const leadingSession = OrchestratorSessionUtil.sessionsOf(project, watchedSessions)[0] ?? null;
  return (
    <section className="ap-crew-strip" aria-label="Crew" onClick={() => onOpenDrawer('close')}>
      <button
        ref={stripReference}
        type="button"
        className="ap-crew-member"
        aria-haspopup="dialog"
        aria-expanded={isDrawerOpen}
        aria-controls={drawerId}
        onClick={(event) => {
          event.stopPropagation();
          onOpenDrawer('close');
        }}
      >
        <span className="ap-crew-member-line">
          <SessionGlyph mark="OR" session={leadingSession} />
          <span className="ap-crew-role">Orchestrator</span>
          {leadingSession === null
            ? null
            : (
              <>
                <span className="ap-pill" data-state={OrchestratorSessionUtil.statePaletteOf(leadingSession.state)}>
                  {OrchestratorSessionUtil.stateWordOf(leadingSession.state)}
                </span>
                <ContextMeter context={leadingSession.context} compact />
              </>
            )}
        </span>
        <LastActionLine session={leadingSession} now={now} />
      </button>
      <span className="ap-crew-strip-actions">
        <button
          type="button"
          className="ap-control"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDrawer('chat');
          }}
        >
          Chat
        </button>
        {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
      </span>
    </section>
  );
}
