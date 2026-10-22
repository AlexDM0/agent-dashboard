import { useState } from 'react';

import type { OrchestratorSession } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }         from './ContextUsageUtil.ts';
import { handOffOrchestrator }      from './OrchestratorSessionDelivery.ts';
import { useSessionRequest }        from './UseSessionRequest.ts';

interface HandoffControlProperties {
  trackerId: string;
  session:   OrchestratorSession;
}

export const HANDOFF_CONFIRMATION_TEXT = 'Hand off asks for a note, stops this session, starts a fresh one with the note.';

/** Quiet below the context threshold, a warning and a loud button at or past it; it acts only on a confirmed click. */
export function HandoffControl({ trackerId, session }: HandoffControlProperties) {
  const handoffRequest = useSessionRequest();
  const [isConfirming, setIsConfirming] = useState(false);
  const isSuggested = ContextUsageUtil.suggestsHandoff(session.context);

  async function confirmHandoff(): Promise<void> {
    setIsConfirming(false);
    await handoffRequest.send(() => handOffOrchestrator(trackerId));
  }

  return (
    <>
      {isSuggested
        ? (
          <p className="ap-handoff-warning" role="status">
            Context {ContextUsageUtil.captionOf(session.context)}: hand this board to a fresh orchestrator before it compacts.
          </p>
        )
        : null}
      {isConfirming
        ? (
          <div className="ap-handoff-confirm" role="group" aria-label="Confirm hand off">
            <span>{HANDOFF_CONFIRMATION_TEXT}</span>
            <button type="button" className="ap-control" onClick={() => void confirmHandoff()}>Hand off</button>
            <button type="button" className="ap-control is-quiet" onClick={() => setIsConfirming(false)}>Cancel</button>
          </div>
        )
        : (
          <button
            type="button"
            className={isSuggested ? 'ap-control' : 'ap-control is-quiet'}
            data-suggested={isSuggested}
            disabled={handoffRequest.isSending}
            onClick={() => setIsConfirming(true)}
          >
            {handoffRequest.isSending ? 'Handing off…' : 'Hand off…'}
          </button>
        )}
      {handoffRequest.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{handoffRequest.refusal}</span>}
    </>
  );
}
