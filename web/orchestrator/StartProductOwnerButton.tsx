import type { ProjectSnapshot }    from '../../src/shared/DashboardContract.ts';
import { startProductOwner }       from './OrchestratorSessionDelivery.ts';
import { OrchestratorSessionUtil } from './OrchestratorSessionUtil.ts';
import { useSessionRequest }       from './UseSessionRequest.ts';

interface StartProductOwnerButtonProperties {
  project:  ProjectSnapshot;
  label:    string;
  /** Called once a product owner lives: at once when one already did, else after the server took the start. */
  onOpened: () => void;
}

/** Starts a product owner in `file` mode when none lives, unconfirmed as Start orchestrator is, then opens its tab. */
export function StartProductOwnerButton({ project, label, onOpened }: StartProductOwnerButtonProperties) {
  const { isSending, refusal, send } = useSessionRequest();

  async function startAndOpen(): Promise<void> {
    if (!OrchestratorSessionUtil.canStart(project, 'product-owner')) {
      onOpened();
      return;
    }
    const wasStarted = await send(() => startProductOwner(project.trackerId, { mode: 'file' }));
    if (wasStarted) onOpened();
  }

  return (
    // The crew strip behind opens its drawer on a click; this button opens it on its own tab instead.
    <span className="ap-orchestrator-request" onClick={(event) => event.stopPropagation()}>
      <button type="button" className="ap-control" disabled={isSending} onClick={() => void startAndOpen()}>
        {isSending ? 'Starting…' : label}
      </button>
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </span>
  );
}
