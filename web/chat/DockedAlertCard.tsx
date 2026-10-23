import { useId, useState } from 'react';

import type { InboxAlert }           from '../inbox/InboxUtil.ts';
import { HANDOFF_CONFIRMATION_TEXT } from '../orchestrator/OrchestratorMenuUtil.ts';
import { handOffOrchestrator }       from '../orchestrator/OrchestratorSessionDelivery.ts';
import { useSessionRequest }         from '../orchestrator/UseSessionRequest.ts';

/** A critical context docked above the composer: the drawer's handoff words and request, disabled with the server's reason while it would refuse. */
export function DockedAlertCard({ alert }: { alert: InboxAlert }) {
  const handoffRequest = useSessionRequest();
  const [isConfirming, setIsConfirming] = useState(false);
  const refusalId = useId();
  const isRefused = alert.handoffRefusal !== null;

  async function confirmHandoff(): Promise<void> {
    setIsConfirming(false);
    await handoffRequest.send(() => handOffOrchestrator(alert.trackerId));
  }

  return (
    <section className="ap-chat-waiting-card" aria-label="Context alert">
      <header className="ap-chat-waiting-head">
        <span className="ap-pill" data-state="in-progress">Alert</span>
      </header>
      <p className="ap-chat-alert-title">Context at {alert.contextPercent}%: refresh the orchestrator</p>
      <p className="muted ap-chat-alert-explanation">{HANDOFF_CONFIRMATION_TEXT}</p>
      <div className="ap-question-actions">
        {isConfirming
          ? (
            <div className="ap-handoff-confirm" role="group" aria-label="Confirm refresh">
              <button type="button" className="ap-control" onClick={() => void confirmHandoff()}>Refresh</button>
              <button type="button" className="ap-control is-quiet" onClick={() => setIsConfirming(false)}>Cancel</button>
            </div>
          )
          : (
            <button
              type="button"
              className="ap-control"
              disabled={isRefused || handoffRequest.isSending}
              aria-describedby={isRefused ? refusalId : undefined}
              onClick={() => setIsConfirming(true)}
            >
              {handoffRequest.isSending ? 'Refreshing…' : 'Refresh…'}
            </button>
          )}
        {isRefused ? <span id={refusalId} className="muted ap-chat-alert-refusal">{alert.handoffRefusal}</span> : null}
        {handoffRequest.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{handoffRequest.refusal}</span>}
      </div>
    </section>
  );
}
