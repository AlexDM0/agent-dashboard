import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { ConcurrencyStepper }   from '../shell/ConcurrencyStepper.tsx';
import { DispatcherPill }       from '../shell/DispatcherPill.tsx';
import { OVERVIEW_HASH }        from '../shell/HashRoute.ts';
import { SlotMeter }            from '../shell/SlotMeter.tsx';
import { StartBuildingButton }  from '../shell/StartBuildingButton.tsx';
import { StopDispatcherButton } from '../shell/StopDispatcherButton.tsx';
import { LowTicketClearance }   from './LowTicketClearance.tsx';

interface BoardToolbarProperties {
  project:  ProjectSnapshot;
  onReload: () => void;
}

export function BoardToolbar({ project, onReload }: BoardToolbarProperties) {
  return (
    <div className="ap-toolbar">
      <a href={OVERVIEW_HASH} className="ap-control is-quiet ap-back">
        <span aria-hidden="true">←</span> Overview <kbd className="ap-kbd">Esc</kbd>
      </a>
      <span className="ap-toolbar-divider" aria-hidden="true" />
      <span className="ap-toolbar-name">{project.project}</span>
      <span className="mono muted ap-toolbar-root">{project.root}</span>
      {project.health.kind === 'ready'
        ? (
          <>
            <DispatcherPill dispatcherState={project.health.board.dispatcherState} />
            <SlotMeter concurrencyLimit={project.health.board.concurrencyLimit} busyCount={project.health.board.agentsInFlight} compact />
            <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={project.health.board.concurrencyLimit} />
            <StartBuildingButton trackerId={project.trackerId} projectName={project.project} />
            <StopDispatcherButton
              trackerId={project.trackerId}
              projectName={project.project}
              dispatcherState={project.health.board.dispatcherState}
              agentsInFlight={project.health.board.agentsInFlight}
            />
            <LowTicketClearance trackerId={project.trackerId} projectName={project.project} waitingTickets={project.health.board.lowPriorityWaitingTickets} />
          </>
        )
        : <span className="ap-pill is-error">{project.health.kind}</span>}
      <div className="ap-toolbar-actions">
        <button type="button" className="ap-control" onClick={onReload} disabled={!project.pageAvailable}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
            <path d="M13.5 2.5v3h-3" />
          </svg>
          Reload
        </button>
        {project.pageAvailable
          ? (
            <a href={project.pageUrl} target="_blank" rel="noopener noreferrer" className="ap-control is-quiet">
              Open in new tab
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 3h4v4" />
                <path d="M13 3 7.5 8.5" />
                <path d="M11.5 9.5v3.5h-8.5v-8.5h3.5" />
              </svg>
            </a>
          )
          : null}
      </div>
    </div>
  );
}
