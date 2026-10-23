import type { BoardSummary, OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { ActiveRowList }                                           from './ActiveRowList.tsx';
import { CardCapacity }                                            from './CardCapacity.tsx';
import { CardCrew }                                                from './CardCrew.tsx';
import { CardFooter }                                              from './CardFooter.tsx';
import { CardIdentity }                                            from './CardIdentity.tsx';
import { openBoardFromCardClick }                                  from './CardNavigation.ts';
import { QueueLine, queueGroupsOf }                                from './QueueLine.tsx';
import { TicketStatusBar }                                         from './TicketStatusBar.tsx';

interface ProjectCardProperties {
  project:         ProjectSnapshot;
  board:           BoardSummary;
  watchedSessions: OrchestratorSession[];
  homeDirectory:   string | null;
  now:             number;
  /** The last snapshot's instant while the event stream is down, else null. */
  staleSince:      number | null;
}

/** An active project: head, capacity, tickets, crew, in flight and footer, each section on its own line. */
export function ProjectCard({
  project, board, watchedSessions, homeDirectory, now, staleSince
}: ProjectCardProperties) {
  const hasFlight = board.activeRows.length > 0 || queueGroupsOf(board).length > 0;
  return (
    <article className="ap-card" aria-label={project.project} onClick={(event) => openBoardFromCardClick(event, project.trackerId)}>
      <CardIdentity project={project} watchedSessions={watchedSessions} homeDirectory={homeDirectory} />
      <CardCapacity project={project} board={board} staleSince={staleSince} />
      <div className="ap-card-section">
        <TicketStatusBar board={board} />
      </div>
      <CardCrew project={project} watchedSessions={watchedSessions} now={now} />
      {hasFlight
        ? (
          <div className="ap-card-section ap-flight">
            <span className="ap-queue-label">In flight</span>
            {board.activeRows.length > 0 ? <ActiveRowList activeRows={board.activeRows} now={now} /> : null}
            <QueueLine board={board} />
          </div>
        )
        : null}
      <CardFooter project={project} canOpen now={now} latestLogLine={board.recentLog[0] ?? null} />
    </article>
  );
}
