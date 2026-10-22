import { useReducer }              from 'react';
import type { DispatcherState }    from '../../src/shared/DashboardContract.ts';
import { requestDispatcherStop }   from './DispatcherStopRequest.ts';
import { DispatcherStopStateUtil } from './DispatcherStopStateUtil.ts';

interface StopDispatcherButtonProperties {
  trackerId:       string;
  projectName:     string;
  dispatcherState: DispatcherState;
  agentsInFlight:  number;
}

type StopDispatcherControlProperties = Omit<StopDispatcherButtonProperties, 'dispatcherState'>;

/** Offered only while the dispatcher runs; the control unmounts, its note with it, once a snapshot shows it stopped. */
export function StopDispatcherButton({ dispatcherState, ...controlProperties }: StopDispatcherButtonProperties) {
  if (dispatcherState !== 'running') return null;
  return <StopDispatcherControl {...controlProperties} />;
}

function StopDispatcherControl({ trackerId, projectName, agentsInFlight }: StopDispatcherControlProperties) {
  const [stopState, dispatch] = useReducer(
    DispatcherStopStateUtil.nextStateOf,
    undefined,
    DispatcherStopStateUtil.initialState
  );
  const note = DispatcherStopStateUtil.noteOf(stopState);

  async function confirmStop(): Promise<void> {
    dispatch({ kind: 'stop-confirmed' });
    dispatch({ kind: 'verdict-received', verdict: await requestDispatcherStop(trackerId) });
  }

  return (
    // The card behind opens its board on a click; nothing inside the group, a disabled button included, may do that.
    <span className="ap-orchestrator-request" onClick={(event) => event.stopPropagation()}>
      {stopState.kind === 'confirming'
        ? (
          <>
            <span className="ap-stepper-note" role="status">{DispatcherStopStateUtil.confirmationQuestionOf(agentsInFlight)}</span>
            <button type="button" className="ap-control" aria-label={`Confirm stopping the dispatcher of ${projectName}`} onClick={() => void confirmStop()}>
              Stop
            </button>
            <button type="button" className="ap-control is-quiet" onClick={() => dispatch({ kind: 'stop-cancelled' })}>
              Cancel
            </button>
          </>
        )
        : (
          <button
            type="button"
            className="ap-control"
            aria-label={`Stop the dispatcher of ${projectName}`}
            disabled={!DispatcherStopStateUtil.isStopAvailable(stopState)}
            onClick={() => dispatch({ kind: 'stop-asked' })}
          >
            Stop
          </button>
        )}
      {note === null ? null : (
        <span className={note.isRefusal ? 'ap-stepper-refusal' : 'ap-stepper-note'} role={note.isRefusal ? 'alert' : 'status'}>
          {note.text}
        </span>
      )}
    </span>
  );
}
