import { useId, useState } from 'react';

import { HANDOFF_CONFIRMATION_TEXT } from '../orchestrator/OrchestratorMenuUtil.ts';
import { handOffOrchestrator }       from '../orchestrator/OrchestratorSessionDelivery.ts';
import { SessionGlyph }              from '../orchestrator/SessionGlyph.tsx';
import { useSessionRequest }         from '../orchestrator/UseSessionRequest.ts';
import { boardHashOf }               from '../shell/HashRoute.ts';
import type { InboxAlert }           from './InboxUtil.ts';

interface InboxAlertCardProperties {
  alert:   InboxAlert;
  onLeave: () => void;
}

/** A critical context as an entry: the drawer's handoff words and request, disabled with the server's reason while it would refuse. */
export function InboxAlertCard({ alert, onLeave }: InboxAlertCardProperties) {
  const handoffRequest = useSessionRequest();
  const [isConfirming, setIsConfirming] = useState(false);
  const refusalId = useId();
  const isRefused = alert.handoffRefusal !== null;

  async function confirmHandoff(): Promise<void> {
    setIsConfirming(false);
    await handoffRequest.send(() => handOffOrchestrator(alert.trackerId));
  }

  return (
    <li className="ap-inbox-entry" data-kind="alert">
      <div className="ap-inbox-entry-head">
        <SessionGlyph role="orchestrator"session={alert.session} />
        <a className="ap-inbox-project" href={boardHashOf(alert.trackerId)} onClick={onLeave}>{alert.project}</a>
        <span className="muted">orchestrator</span>
        <span className="ap-inbox-hosted">hosted</span>
      </div>
      <p className="ap-inbox-alert-title">Context at {alert.contextPercent}%: refresh the orchestrator</p>
      <p className="muted ap-inbox-alert-explanation">{HANDOFF_CONFIRMATION_TEXT}</p>
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
        {isRefused ? <span id={refusalId} className="muted ap-inbox-refusal">{alert.handoffRefusal}</span> : null}
        {handoffRequest.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{handoffRequest.refusal}</span>}
      </div>
    </li>
  );
}
