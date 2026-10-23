import type { BoardSummary, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { BoardCommandControls }               from '../board/BoardCommandControls.tsx';
import { RootPathUtil }                       from '../board/RootPathUtil.ts';
import { OrchestratorSessionUtil }            from '../orchestrator/OrchestratorSessionUtil.ts';
import { ConcurrencyStepper }                 from '../shell/ConcurrencyStepper.tsx';
import { projectActivityOf }                  from '../shell/ProjectActivity.ts';
import { ProjectDot }                         from '../shell/ProjectDot.tsx';
import { TimeUtil }                           from '../time/TimeUtil.ts';
import { openBoardFromCardClick }             from './CardNavigation.ts';
import { OpenBoardButton }                    from './OpenBoardButton.tsx';
import { ticketReferenceOf }                  from './TicketReference.ts';
import { TicketStatusBar }                    from './TicketStatusBar.tsx';

interface IdleProjectRowProperties {
  project:       ProjectSnapshot;
  board:         BoardSummary;
  homeDirectory: string | null;
  now:           number;
}

function SlotCount({ board }: { board: BoardSummary }) {
  return (
    <span className="mono ap-idle-slot-count" role="img" aria-label={`${String(board.agentsInFlight)} of ${String(board.concurrencyLimit)} slots busy`}>
      {board.agentsInFlight}/{board.concurrencyLimit}
    </span>
  );
}

/** An idle project on one line; with ready tickets it adds the stepper, their chips and the dispatcher's actions. */
export function IdleProjectRow({
  project, board, homeDirectory, now
}: IdleProjectRowProperties) {
  const latestLogLine = board.recentLog[0];
  const hasReadyTickets = board.readyTicketIds.length > 0;
  const lowPriorityWaitingCount = board.lowPriorityWaitingTickets.length;
  return (
    <li className="ap-idle-row" aria-label={project.project} onClick={(event) => openBoardFromCardClick(event, project.trackerId)}>
      <span className="ap-idle-identity">
        <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
        <span className="ap-idle-name ellipsis" title={project.project}>{project.project}</span>
        <span className="mono muted ellipsis ap-idle-path" title={project.root}>{RootPathUtil.shortenedRootOf(project.root, homeDirectory)}</span>
      </span>
      <span className="ap-idle-tickets"><TicketStatusBar board={board} hasLegend={false} /></span>
      <span className="ap-idle-slots">
        <span className="muted ap-caption">slots</span>
        {hasReadyTickets
          ? (
            <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={board.concurrencyLimit}>
              <SlotCount board={board} />
            </ConcurrencyStepper>
          )
          : <SlotCount board={board} />}
      </span>
      <span className="ap-idle-log">
        {latestLogLine === undefined
          ? null
          : (
            <>
              <span className="mono muted ap-log-time">{TimeUtil.logStampText(latestLogLine.at, now)}</span>
              <span className="ellipsis ap-log-text" title={latestLogLine.text}>{latestLogLine.text}</span>
            </>
          )}
      </span>
      {hasReadyTickets
        ? (
          <>
            <span className="ap-idle-ready">
              <span className="ap-queue-label">Ready</span>
              {board.readyTicketIds.map((ticketId) => <span key={ticketId} className="ap-chip" data-state="pending">{ticketReferenceOf(ticketId)}</span>)}
              {lowPriorityWaitingCount > 0 ? <span className="mono muted ap-caption">+ {lowPriorityWaitingCount} low</span> : null}
            </span>
            <span className="ap-idle-actions"><BoardCommandControls project={project} board={board} /></span>
          </>
        )
        : null}
      <span className="mono muted ap-caption ap-idle-changed" title={project.lastCommand}>{TimeUtil.agoPhraseOfStamp(project.lastChangedAt, now)}</span>
      <span className="ap-idle-open"><OpenBoardButton trackerId={project.trackerId} projectName={project.project} /></span>
    </li>
  );
}
