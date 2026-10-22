import { useId }                                     from 'react';
import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { startOrchestrator }                         from './OrchestratorSessionDelivery.ts';
import { OrchestratorSessionUtil }                   from './OrchestratorSessionUtil.ts';
import { SessionCard }                               from './SessionCard.tsx';
import { useOrchestratorPanelOpen }                  from './UseOrchestratorPanelOpen.ts';
import { useSessionRequest }                         from './UseSessionRequest.ts';

interface OrchestratorPanelProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
}

function StartOrchestratorButton({ project }: { project: ProjectSnapshot }) {
  const { isSending, refusal, send } = useSessionRequest();
  return (
    <div className="ap-orchestrator-request">
      <button
        type="button"
        className="ap-control"
        aria-label={`Start an orchestrator for ${project.project}`}
        disabled={isSending}
        onClick={() => void send(() => startOrchestrator(project.trackerId, { startBuilding: false }))}
      >
        {isSending ? 'Starting…' : 'Start orchestrator'}
      </button>
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </div>
  );
}

/** The board's right column (a bottom sheet on a phone): every session of the project, the dashboard-owned one first. */
export function OrchestratorPanel({ project, watchedSessions }: OrchestratorPanelProperties) {
  const { isOpen, toggle } = useOrchestratorPanelOpen();
  const bodyId = useId();
  const sessions = OrchestratorSessionUtil.sessionsOf(project, watchedSessions);
  const isQuestionWaiting = OrchestratorSessionUtil.isQuestionWaiting(project);
  return (
    <aside className="ap-orchestrator-panel" data-open={isOpen} aria-label="Orchestrators">
      <button type="button" className="ap-orchestrator-toggle" aria-expanded={isOpen} aria-controls={bodyId} onClick={toggle}>
        <span className="ap-queue-label">Orchestrators</span>
        <span className="mono muted">{sessions.length}</span>
        {isQuestionWaiting ? <span className="ap-question-marker" data-state="in-review">question waiting</span> : null}
        <span className="ap-orchestrator-toggle-icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen
        ? (
          <div className="ap-orchestrator-body" id={bodyId}>
            {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
            {sessions.length === 0 ? <p className="muted ap-caption">No orchestrator runs in this project</p> : null}
            {sessions.map((session) => <SessionCard key={`${project.trackerId}:${session.sessionId}`} trackerId={project.trackerId} session={session} />)}
          </div>
        )
        : null}
    </aside>
  );
}
