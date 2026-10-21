import { useState }                                        from 'react';
import { requestConcurrencyLimit }                         from './ConcurrencyRequest.ts';
import { steppedConcurrencyLimitOf, type ConcurrencyStep } from './ConcurrencyStep.ts';

interface ConcurrencyStepperProperties {
  trackerId:   string;
  projectName: string;
  /** The limit the current snapshot carries; a step is computed from it and shown only once a snapshot carries it. */
  shownLimit:  number;
}

export function ConcurrencyStepper({ trackerId, projectName, shownLimit }: ConcurrencyStepperProperties) {
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [refusalReason, setRefusalReason] = useState<string | null>(null);

  async function requestStep(step: ConcurrencyStep): Promise<void> {
    const steppedLimit = steppedConcurrencyLimitOf(shownLimit, step);
    if (steppedLimit === null) return;
    setRefusalReason(null);
    setIsRequestInFlight(true);
    const verdict = await requestConcurrencyLimit(trackerId, steppedLimit);
    setIsRequestInFlight(false);
    if (verdict.kind === 'refused') setRefusalReason(verdict.reason);
  }

  return (
    // The card behind opens its board on a click; nothing inside the stepper, a disabled button included, may do that.
    <span className="ap-stepper" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ap-control ap-stepper-button"
        aria-label={`Lower the agent limit of ${projectName}`}
        disabled={isRequestInFlight || steppedConcurrencyLimitOf(shownLimit, 'lower') === null}
        onClick={() => void requestStep('lower')}
      >
        −
      </button>
      <button
        type="button"
        className="ap-control ap-stepper-button"
        aria-label={`Raise the agent limit of ${projectName}`}
        disabled={isRequestInFlight || steppedConcurrencyLimitOf(shownLimit, 'raise') === null}
        onClick={() => void requestStep('raise')}
      >
        +
      </button>
      {refusalReason === null ? null : <span className="ap-stepper-refusal" role="alert">{refusalReason}</span>}
    </span>
  );
}
