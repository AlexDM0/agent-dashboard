import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { ProjectOrdering }      from '../overview/ProjectOrdering.ts';
import { boardHashOf }          from '../shell/HashRoute.ts';
import { projectActivityOf }    from '../shell/ProjectActivity.ts';
import { ProjectDot }           from '../shell/ProjectDot.tsx';

interface ProjectRailProperties {
  projects:          ProjectSnapshot[];
  selectedTrackerId: string;
}

export function ProjectRail({ projects, selectedTrackerId }: ProjectRailProperties) {
  const groups = ProjectOrdering.grouped(projects, 'all', '');
  return (
    <nav className="ap-rail" aria-label="Projects">
      <div className="ap-rail-title">Projects</div>
      {[...groups.active, ...groups.idle].map((project) => {
        const isSelected = project.trackerId === selectedTrackerId;
        return (
          <a
            key={project.trackerId}
            href={boardHashOf(project.trackerId)}
            className={isSelected ? 'ap-rail-row is-selected' : 'ap-rail-row'}
            {...(isSelected ? { 'aria-current': 'page' as const } : {})}
          >
            <ProjectDot activity={projectActivityOf(project)} />
            <span className="ap-rail-name">{project.project}</span>
            {project.health.kind === 'ready'
              ? <span className="ap-rail-agents">{project.health.board.agentsInFlight}/{project.health.board.concurrencyLimit}</span>
              : null}
          </a>
        );
      })}
    </nav>
  );
}
