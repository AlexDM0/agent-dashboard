import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { ContextMeter }                              from './ContextMeter.tsx';
import { OrchestratorSessionUtil }                   from './OrchestratorSessionUtil.ts';
import { SessionGlyph }                              from './SessionGlyph.tsx';

interface OrchestratorSummaryProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
}

/** The project's leading session on one line of a card: its glyph, name, context and a question waiting; nothing without one. */
export function OrchestratorSummary({ project, watchedSessions }: OrchestratorSummaryProperties) {
  const sessions = OrchestratorSessionUtil.sessionsOf(project, watchedSessions);
  const leadingSession = sessions[0];
  if (leadingSession === undefined) return null;
  const sessionName = OrchestratorSessionUtil.nameOf(leadingSession);
  return (
    <span className="ap-orchestrator-summary">
      <SessionGlyph role="orchestrator" session={leadingSession} />
      <span className="ap-orchestrator-summary-name ellipsis" title={sessionName}>{sessionName}</span>
      <ContextMeter context={leadingSession.context} compact />
      {OrchestratorSessionUtil.isQuestionWaiting(project) ? <span className="ap-question-marker" data-state="in-review">question waiting</span> : null}
      {sessions.length > 1 ? <span className="mono muted ap-caption">+{sessions.length - 1}</span> : null}
    </span>
  );
}
