import { useEffect, useReducer, useRef }                   from 'react';
import { WEB_LIMITS }                                      from '../constants/WebLimits.ts';
import { requestConcurrencyLimit }                         from './ConcurrencyRequest.ts';
import { steppedConcurrencyLimitOf, type ConcurrencyStep } from './ConcurrencyStep.ts';
import { ConcurrencyStepperStateUtil }                     from './ConcurrencyStepperStateUtil.ts';

interface ConcurrencyStepperProperties {
  trackerId:   string;
  projectName: string;
  /** The limit the current snapshot carries; a step is computed from it and shown only once a snapshot carries it. */
  shownLimit:  number;
}

export function ConcurrencyStepper({ trackerId, projectName, shownLimit }: ConcurrencyStepperProperties) {
  const [stepperState, dispatch] = useReducer(
    ConcurrencyStepperStateUtil.nextStateOf,
    undefined,
    ConcurrencyStepperStateUtil.initialState
  );
  const isBusy = ConcurrencyStepperStateUtil.isBusy(stepperState);
  const note = ConcurrencyStepperStateUtil.noteOf(stepperState);
  const isAwaitingSnapshot = stepperState.kind === 'awaiting-snapshot';

  // A snapshot can carry the new limit before the request's own answer arrives; the answer then reads it here.
  const shownLimitRef = useRef(shownLimit);
  useEffect(() => {
    shownLimitRef.current = shownLimit;
    dispatch({ kind: 'snapshot-received', shownLimit });
  }, [shownLimit]);

  useEffect(() => {
    if (!isAwaitingSnapshot) return undefined;
    const waitTimeout = window.setTimeout(
      () => dispatch({ kind: 'snapshot-wait-elapsed' }),
      WEB_LIMITS.CONCURRENCY_SNAPSHOT_WAIT_MILLISECONDS
    );
    return () => window.clearTimeout(waitTimeout);
  }, [isAwaitingSnapshot]);

  async function requestStep(step: ConcurrencyStep): Promise<void> {
    const steppedLimit = steppedConcurrencyLimitOf(shownLimit, step);
    if (steppedLimit === null) return;
    dispatch({ kind: 'request-sent', requestedLimit: steppedLimit });
    const verdict = await requestConcurrencyLimit(trackerId, steppedLimit);
    dispatch({ kind: 'verdict-received', verdict, shownLimit: shownLimitRef.current });
  }

  return (
    // The card behind opens its board on a click; nothing inside the stepper, a disabled button included, may do that.
    <span className="ap-stepper" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ap-control ap-stepper-button"
        aria-label={`Lower the agent limit of ${projectName}`}
        disabled={isBusy || steppedConcurrencyLimitOf(shownLimit, 'lower') === null}
        onClick={() => void requestStep('lower')}
      >
        −
      </button>
      <button
        type="button"
        className="ap-control ap-stepper-button"
        aria-label={`Raise the agent limit of ${projectName}`}
        disabled={isBusy || steppedConcurrencyLimitOf(shownLimit, 'raise') === null}
        onClick={() => void requestStep('raise')}
      >
        +
      </button>
      {note === null ? null : (
        <span className={note.isRefusal ? 'ap-stepper-refusal' : 'ap-stepper-note'} role={note.isRefusal ? 'alert' : 'status'}>
          {note.text}
        </span>
      )}
    </span>
  );
}
