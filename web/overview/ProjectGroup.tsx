import { useState }                                  from 'react';
import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import { ProblemCard }                               from './ProblemCard.tsx';
import { ProjectCard }                               from './ProjectCard.tsx';

interface ProjectGroupProperties {
  title:                         string;
  projects:                      ProjectSnapshot[];
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
  now:                           number;
  staleSince:                    number | null;
  collapsesOnPhone?:             boolean;
}

/** On a phone a collapsing group shows its first card and a disclosure naming the rest (the stylesheet hides them). */
export function ProjectGroup({
  title, projects, watchedOrchestratorsByTracker, now, staleSince, collapsesOnPhone = false
}: ProjectGroupProperties) {
  const [expanded, setExpanded] = useState(false);
  if (projects.length === 0) {
    return null;
  }
  const hiddenProjects = projects.slice(1);
  const isCollapsed = collapsesOnPhone && !expanded && hiddenProjects.length > 0;
  return (
    <section className="ap-group" aria-label={title}>
      <div className="ap-group-heading">
        <h2 className="ap-group-title">{title}</h2>
        <span className="ap-group-count">{projects.length}</span>
      </div>
      <div className="ap-card-grid" data-collapsed={isCollapsed}>
        {projects.map((project) => (project.health.kind === 'ready'
          ? (
            <ProjectCard
              key={project.trackerId}
              project={project}
              board={project.health.board}
              watchedSessions={OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId)}
              now={now}
              staleSince={staleSince}
            />
          )
          : <ProblemCard key={project.trackerId} project={project} reason={project.health.reason} now={now} />))}
      </div>
      {isCollapsed
        ? (
          <button className="ap-disclosure" type="button" aria-expanded="false" onClick={() => setExpanded(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span>{title} · {hiddenProjects.length} more</span>
            <span className="mono ellipsis ap-disclosure-names">{hiddenProjects.map((project) => project.project).join(', ')}</span>
          </button>
        )
        : null}
    </section>
  );
}
