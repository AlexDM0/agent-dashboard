import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { ContextMeter }                                           from '../orchestrator/ContextMeter.tsx';
import { OrchestratorSessionUtil }                                from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                                           from '../orchestrator/SessionGlyph.tsx';
import { TimeUtil }                                               from '../time/TimeUtil.ts';

interface CardCrewProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  now:             number;
}

interface LeadingSession {
  role:    SessionRole;
  session: OrchestratorSession;
}

const OWNERSHIP_WORDS: Record<OrchestratorSession['ownership'], string> = { dashboard: 'hosted', watched: 'desktop app' };

/** The live orchestrator leads; without one the live product owner does; null when no session lives. */
export function leadingSessionOf(project: ProjectSnapshot, watchedSessions: OrchestratorSession[]): LeadingSession | null {
  const orchestrator = OrchestratorSessionUtil.sessionsOf(project, watchedSessions).find((session) => session.state !== 'ended');
  if (orchestrator !== undefined) return { role: 'orchestrator', session: orchestrator };
  const { productOwner } = project;
  return productOwner === null || productOwner.state === 'ended' ? null : { role: 'product-owner', session: productOwner };
}

export function CardCrew({ project, watchedSessions, now }: CardCrewProperties) {
  const leading = leadingSessionOf(project, watchedSessions);
  if (leading === null) return null;
  const { role, session } = leading;
  const sessionName = OrchestratorSessionUtil.nameOf(session, role);
  return (
    <div className="ap-card-section ap-card-crew">
      <div className="ap-card-crew-line">
        <SessionGlyph role={role} session={session} />
        <span className="ap-card-crew-name ellipsis" title={sessionName}>{sessionName}</span>
        <span className="muted ap-caption">{OWNERSHIP_WORDS[session.ownership]}</span>
        {session.context === null ? null : <ContextMeter context={session.context} compact />}
        {OrchestratorSessionUtil.isQuestionWaiting(project) ? <span className="ap-question-marker" data-state="in-review">question waiting</span> : null}
      </div>
      {session.lastAction === null
        ? null
        : (
          <div className="ap-card-crew-action" title={session.lastAction.text}>
            <span className="ellipsis">{session.lastAction.text}</span>
            <span className="mono muted ap-caption">{TimeUtil.agoPhraseOfStamp(session.lastAction.at, now)}</span>
          </div>
        )}
    </div>
  );
}
