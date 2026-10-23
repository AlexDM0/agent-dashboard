import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import { IdleProjectRow }                            from './IdleProjectRow.tsx';
import { ProblemCard }                               from './ProblemCard.tsx';
import { ProjectCard }                               from './ProjectCard.tsx';
import { isAllDeliveredWithNothingReady }            from './TicketBar.ts';

/** Active projects are cards; idle ones are rows of one panel, an unreadable or missing one keeping its card. */
export type ProjectGroupLayout = 'cards' | 'rows';

interface ProjectGroupProperties {
  title:                         string;
  layout:                        ProjectGroupLayout;
  projects:                      ProjectSnapshot[];
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
  homeDirectory:                 string | null;
  now:                           number;
  staleSince:                    number | null;
}

function isSettled(project: ProjectSnapshot): boolean {
  if (project.health.kind !== 'ready') return false;
  const { board } = project.health;
  return isAllDeliveredWithNothingReady(board.ticketCountByStatus, board.ticketTotal, board.readyTicketIds.length);
}

export function ProjectGroup({
  title, layout, projects, watchedOrchestratorsByTracker, homeDirectory, now, staleSince
}: ProjectGroupProperties) {
  if (projects.length === 0) {
    return null;
  }
  const watchedSessionsOf = (project: ProjectSnapshot) => OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId);
  const cardProjects = layout === 'rows' ? projects.filter((project) => project.health.kind !== 'ready') : projects;
  const cards = cardProjects.map((project) => (project.health.kind === 'ready'
    ? (
      <ProjectCard
        key={project.trackerId}
        project={project}
        board={project.health.board}
        watchedSessions={watchedSessionsOf(project)}
        homeDirectory={homeDirectory}
        now={now}
        staleSince={staleSince}
      />
    )
    : (
      <ProblemCard
        key={project.trackerId}
        project={project}
        reason={project.health.reason}
        watchedSessions={watchedSessionsOf(project)}
        homeDirectory={homeDirectory}
        now={now}
      />
    )));
  const rows = layout === 'rows'
    ? projects.flatMap((project) => (project.health.kind === 'ready'
      ? [<IdleProjectRow key={project.trackerId} project={project} board={project.health.board} homeDirectory={homeDirectory} now={now} />]
      : []))
    : [];
  return (
    <section className="ap-group" aria-label={title}>
      <div className="ap-group-heading">
        <h2 className="ap-group-title">{title}</h2>
        <span className="ap-group-count">{projects.length}</span>
        {layout === 'rows' && projects.every((project) => isSettled(project))
          ? <span className="muted ap-caption">· all delivered, nothing ready</span>
          : null}
      </div>
      {rows.length > 0 ? <ul className="ap-idle-panel">{rows}</ul> : null}
      {cards.length > 0 ? <div className="ap-card-grid">{cards}</div> : null}
    </section>
  );
}
