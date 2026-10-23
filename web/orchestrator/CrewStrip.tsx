import type { RefObject }                                         from 'react';
import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { useNow }                                                 from '../shell/UseNow.ts';
import { TimeUtil }                                               from '../time/TimeUtil.ts';
import { ContextMeter }                                           from './ContextMeter.tsx';
import type { CrewDrawerFocus }                                   from './CrewDrawer.tsx';
import { OrchestratorSessionUtil }                                from './OrchestratorSessionUtil.ts';
import { SessionGlyph }                                           from './SessionGlyph.tsx';
import { StartOrchestratorButton }                                from './StartOrchestratorButton.tsx';
import { StartProductOwnerButton }                                from './StartProductOwnerButton.tsx';

interface CrewStripProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  isDrawerOpen:    boolean;
  drawerId:        string;
  stripReference:  RefObject<HTMLButtonElement | null>;
  onOpenDrawer:    (focus: CrewDrawerFocus, tab: SessionRole) => void;
}

interface CrewMemberProperties {
  role:         SessionRole;
  session:      OrchestratorSession | null;
  isDrawerOpen: boolean;
  drawerId:     string;
  now:          number;
  onOpen:       () => void;
  reference?:   RefObject<HTMLButtonElement | null>;
}

const ROLE_LABELS: Record<SessionRole, string> = { 'orchestrator': 'Orchestrator', 'product-owner': 'Product owner' };
const ABSENT_TEXTS: Record<SessionRole, string> = { 'orchestrator': 'No orchestrator runs in this project', 'product-owner': 'No product owner runs in this project' };

function LastActionLine({ role, session, now }: { role: SessionRole; session: OrchestratorSession | null; now: number }) {
  if (session === null) return <span className="muted ap-crew-action">{ABSENT_TEXTS[role]}</span>;
  if (session.lastAction === null) return <span className="muted ap-crew-action">No action yet</span>;
  return (
    <span className="ap-crew-action" title={session.lastAction.text}>
      <span className="ellipsis">{session.lastAction.text}</span>
      <span className="mono muted ap-crew-action-age">{TimeUtil.agoPhraseOfStamp(session.lastAction.at, now)}</span>
    </span>
  );
}

function CrewMember({
  role, session, isDrawerOpen, drawerId, now, onOpen, reference
}: CrewMemberProperties) {
  return (
    <button
      {...(reference === undefined ? {} : { ref: reference })}
      type="button"
      className="ap-crew-member"
      data-role={role}
      aria-haspopup="dialog"
      aria-expanded={isDrawerOpen}
      aria-controls={drawerId}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <span className="ap-crew-member-line">
        <SessionGlyph role={role} session={session} />
        <span className="ap-crew-role">{ROLE_LABELS[role]}</span>
        {session === null
          ? null
          : (
            <>
              <span className="ap-pill" data-state={OrchestratorSessionUtil.statePaletteOf(session.state, role)}>
                {OrchestratorSessionUtil.stateWordOf(session.state)}
              </span>
              <ContextMeter context={session.context} compact />
            </>
          )}
      </span>
      <LastActionLine role={role} session={session} now={now} />
    </button>
  );
}

/** The board's crew in one strip over the frame: the leading orchestrator and the product owner, each a click from its drawer tab. */
export function CrewStrip({
  project, watchedSessions, isDrawerOpen, drawerId, stripReference, onOpenDrawer
}: CrewStripProperties) {
  const now = useNow();
  const leadingSession = OrchestratorSessionUtil.sessionsOf(project, watchedSessions)[0] ?? null;
  const productOwner = OrchestratorSessionUtil.shownProductOwnerOf(project);
  return (
    <section className="ap-crew-strip" aria-label="Crew" onClick={() => onOpenDrawer('close', 'orchestrator')}>
      <CrewMember
        role="orchestrator"
        session={leadingSession}
        isDrawerOpen={isDrawerOpen}
        drawerId={drawerId}
        now={now}
        onOpen={() => onOpenDrawer('close', 'orchestrator')}
        reference={stripReference}
      />
      <span className="ap-crew-strip-actions">
        <button
          type="button"
          className="ap-control"
          onClick={(event) => {
            event.stopPropagation();
            onOpenDrawer('chat', 'orchestrator');
          }}
        >
          Chat
        </button>
        {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
      </span>
      <span className="ap-crew-strip-divider" aria-hidden="true" />
      {productOwner === null
        ? null
        : (
          <CrewMember
            role="product-owner"
            session={productOwner}
            isDrawerOpen={isDrawerOpen}
            drawerId={drawerId}
            now={now}
            onOpen={() => onOpenDrawer('close', 'product-owner')}
          />
        )}
      <span className="ap-crew-strip-actions" data-role="product-owner" data-alone={productOwner === null}>
        <StartProductOwnerButton key={project.trackerId} project={project} label="+ New ticket" onOpened={() => onOpenDrawer('chat', 'product-owner')} />
      </span>
    </section>
  );
}
