import type { BoardSummary, ProjectSnapshot }  from '../../src/shared/DashboardContract.ts';
import { ConcurrencyStepper }                  from '../shell/ConcurrencyStepper.tsx';
import { DispatcherPill }                      from '../shell/DispatcherPill.tsx';
import { OVERVIEW_HASH }                       from '../shell/HashRoute.ts';
import { StartBuildingButton }                 from '../shell/StartBuildingButton.tsx';
import { StopDispatcherButton }                from '../shell/StopDispatcherButton.tsx';
import { type BoardCommand, BoardCommandUtil } from './BoardCommandUtil.ts';
import { LowTicketPopover }                    from './LowTicketPopover.tsx';
import { RootPathUtil }                        from './RootPathUtil.ts';

interface BoardToolbarProperties {
  project:       ProjectSnapshot;
  homeDirectory: string | null;
  onReload:      () => void;
}

interface BoardCommandControlProperties {
  command: BoardCommand;
  project: ProjectSnapshot;
  board:   BoardSummary;
}

function BoardCommandControl({ command, project, board }: BoardCommandControlProperties) {
  switch (command) {
    case 'start-building':
      return <StartBuildingButton trackerId={project.trackerId} projectName={project.project} isPrimary />;
    case 'stop-dispatcher':
      return (
        <StopDispatcherButton
          trackerId={project.trackerId}
          projectName={project.project}
          dispatcherState={board.dispatcherState}
          agentsInFlight={board.agentsInFlight}
        />
      );
    case 'include-low-priority':
    case 'pick-up-low-priority':
      return (
        <LowTicketPopover
          trackerId={project.trackerId}
          projectName={project.project}
          label={BoardCommandUtil.lowPriorityLabelOf(board.dispatcherState, board.lowPriorityWaitingTickets.length)}
          waitingTickets={board.lowPriorityWaitingTickets}
        />
      );
  }
}

function DispatcherControls({ project, board }: { project: ProjectSnapshot; board: BoardSummary }) {
  return (
    <>
      <DispatcherPill dispatcherState={board.dispatcherState} />
      <span className="ap-command-slots">
        <span className="muted">slots</span>
        <span className="mono" role="img" aria-label={`${String(board.agentsInFlight)} of ${String(board.concurrencyLimit)} slots busy`}>
          {board.agentsInFlight}/{board.concurrencyLimit}
        </span>
        <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={board.concurrencyLimit} />
      </span>
      {BoardCommandUtil.commandsOf(board.dispatcherState, board.lowPriorityWaitingTickets.length).map((command) => (
        <BoardCommandControl key={command} command={command} project={project} board={board} />
      ))}
    </>
  );
}

/** One row over the frame: where the board is on the left, what can be done with it on the right. */
export function BoardToolbar({ project, homeDirectory, onReload }: BoardToolbarProperties) {
  return (
    <div className="ap-toolbar">
      <a href={OVERVIEW_HASH} className="ap-control is-quiet ap-back">
        <span aria-hidden="true">←</span> Overview <kbd className="ap-kbd">Esc</kbd>
      </a>
      <span className="ap-toolbar-divider" aria-hidden="true" />
      <span className="ap-toolbar-name">{project.project}</span>
      <span className="mono muted ap-toolbar-root" title={project.root}>{RootPathUtil.shortenedRootOf(project.root, homeDirectory)}</span>
      <div className="ap-toolbar-actions">
        {project.health.kind === 'ready'
          ? <DispatcherControls project={project} board={project.health.board} />
          : <span className="ap-pill is-error">{project.health.kind}</span>}
        <button type="button" className="ap-control ap-icon-control" aria-label="Reload board" title="Reload board" onClick={onReload} disabled={!project.pageAvailable}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
            <path d="M13.5 2.5v3h-3" />
          </svg>
        </button>
        {project.pageAvailable
          ? (
            <a
              href={project.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ap-control is-quiet ap-icon-control"
              aria-label="Open board in a new tab"
              title="Open board in a new tab"
            >
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
