import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { startOrchestrator }    from './OrchestratorSessionDelivery.ts';
import { useSessionRequest }    from './UseSessionRequest.ts';

/** Starts a dashboard-owned orchestrator that waits for the user's go (`startBuilding` false). */
export function StartOrchestratorButton({ project }: { project: ProjectSnapshot }) {
  const { isSending, refusal, send } = useSessionRequest();
  return (
    // The crew strip behind opens its drawer on a click; starting a session must not do that too.
    <span className="ap-orchestrator-request" onClick={(event) => event.stopPropagation()}>
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
    </span>
  );
}
