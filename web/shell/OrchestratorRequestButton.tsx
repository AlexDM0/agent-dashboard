import { useEffect, useReducer }        from 'react';
import type { OrchestratorRequest }     from '../../src/shared/DashboardContract.ts';
import { WEB_LIMITS }                   from '../constants/WebLimits.ts';
import { deliverOrchestratorRequest }   from './OrchestratorRequestDelivery.ts';
import { OrchestratorRequestStateUtil } from './OrchestratorRequestStateUtil.ts';

interface OrchestratorRequestButtonProperties {
  trackerId:             string;
  label:                 string;
  accessibleLabel:       string;
  isDisabled?:           boolean;
  isPrimary?:            boolean;
  orchestratorRequestOf: () => OrchestratorRequest;
  onSent?:               () => void;
}

export function OrchestratorRequestButton({
  trackerId, label, accessibleLabel, isDisabled = false, isPrimary = false, orchestratorRequestOf, onSent
}: OrchestratorRequestButtonProperties) {
  const [requestState, dispatch] = useReducer(
    OrchestratorRequestStateUtil.nextStateOf,
    undefined,
    OrchestratorRequestStateUtil.initialState
  );
  const isBusy = OrchestratorRequestStateUtil.isBusy(requestState);
  const note = OrchestratorRequestStateUtil.noteOf(requestState);
  const isShowingSentNote = requestState.kind === 'sent';

  useEffect(() => {
    if (!isShowingSentNote) return undefined;
    const noteTimeout = window.setTimeout(
      () => dispatch({ kind: 'sent-note-elapsed' }),
      WEB_LIMITS.ORCHESTRATOR_SENT_NOTE_MILLISECONDS
    );
    return () => window.clearTimeout(noteTimeout);
  }, [isShowingSentNote]);

  async function sendRequest(): Promise<void> {
    dispatch({ kind: 'request-sent' });
    const verdict = await deliverOrchestratorRequest(trackerId, orchestratorRequestOf());
    dispatch({ kind: 'verdict-received', verdict });
    if (verdict.kind === 'sent') onSent?.();
  }

  return (
    // The card behind opens its board on a click; nothing inside the button's group, a disabled button included, may do that.
    <span className="ap-orchestrator-request" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ap-control"
        data-primary={isPrimary}
        aria-label={accessibleLabel}
        disabled={isBusy || isDisabled}
        onClick={() => void sendRequest()}
      >
        {label}
      </button>
      {note === null ? null : (
        <span className={note.isRefusal ? 'ap-stepper-refusal' : 'ap-stepper-note'} role={note.isRefusal ? 'alert' : 'status'}>
          {note.text}
        </span>
      )}
    </span>
  );
}
