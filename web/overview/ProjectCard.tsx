import type { BoardSummary, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { ConcurrencyStepper }                 from '../shell/ConcurrencyStepper.tsx';
import { SlotMeter }                          from '../shell/SlotMeter.tsx';
import { TimeUtil }                           from '../time/TimeUtil.ts';
import { ActiveRowList }                      from './ActiveRowList.tsx';
import { CardFooter }                         from './CardFooter.tsx';
import { CardIdentity }                       from './CardIdentity.tsx';
import { openBoardFromCardClick }             from './CardNavigation.ts';
import { QueueLine }                          from './QueueLine.tsx';
import { TicketStatusBar }                    from './TicketStatusBar.tsx';

interface ProjectCardProperties {
  project:    ProjectSnapshot;
  board:      BoardSummary;
  now:        number;
  /** The last snapshot's instant while the event stream is down, else null. */
  staleSince: number | null;
}

export function ProjectCard({
  project, board, now, staleSince
}: ProjectCardProperties) {
  const latestLogLine = board.recentLog[0];
  return (
    <article className="ap-card" aria-label={project.project} onClick={(event) => openBoardFromCardClick(event, project.trackerId)}>
      <CardIdentity project={project} />
      <div className="ap-card-section ap-card-meters">
        <div className="ap-meter-row">
          <span className="ap-queue-label ap-meter-label">Slots</span>
          <SlotMeter slotCount={board.concurrencyLimit} busyCount={board.agentsInFlight} />
          <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={board.concurrencyLimit} />
          {staleSince === null ? null : <span className="mono muted ap-meter-as-of">as of {TimeUtil.clockOfInstant(staleSince)}</span>}
        </div>
        <div className="ap-meter-row">
          <span className="ap-queue-label ap-meter-label">Tickets</span>
          <TicketStatusBar board={board} />
        </div>
      </div>
      {board.activeRows.length > 0 ? <ActiveRowList activeRows={board.activeRows} now={now} /> : null}
      <QueueLine board={board} />
      {latestLogLine === undefined
        ? null
        : (
          <div className="ap-card-section ap-log-line">
            <span className="mono muted ap-log-time">{TimeUtil.logStampText(latestLogLine.at, now)}</span>
            <span className="ellipsis ap-log-text" title={latestLogLine.text}>{latestLogLine.text}</span>
          </div>
        )}
      <CardFooter project={project} canOpen now={now} />
    </article>
  );
}
