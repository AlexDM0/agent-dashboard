import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import { OrchestratorSummary }                       from '../orchestrator/OrchestratorSummary.tsx';
import { ProjectOrdering }                           from '../overview/ProjectOrdering.ts';
import { boardHashOf }                               from '../shell/HashRoute.ts';
import { projectActivityOf }                         from '../shell/ProjectActivity.ts';
import { ProjectDot }                                from '../shell/ProjectDot.tsx';

interface ProjectRailProperties {
  projects:                      ProjectSnapshot[];
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
  selectedTrackerId:             string;
}

interface RailGroupProperties {
  title:                         string;
  projects:                      ProjectSnapshot[];
  watchedOrchestratorsByTracker: Record<string, OrchestratorSession[]>;
  selectedTrackerId:             string;
}

function RailGroup({
  title, projects, watchedOrchestratorsByTracker, selectedTrackerId
}: RailGroupProperties) {
  if (projects.length === 0) {
    return null;
  }
  return (
    <div className="ap-rail-group" role="group" aria-label={title}>
      <div className="ap-rail-title">{title}</div>
      {projects.map((project) => {
        const isSelected = project.trackerId === selectedTrackerId;
        return (
          <a
            key={project.trackerId}
            href={boardHashOf(project.trackerId)}
            className={isSelected ? 'ap-rail-row is-selected' : 'ap-rail-row'}
            {...(isSelected ? { 'aria-current': 'page' as const } : {})}
          >
            <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
            <span className="ap-rail-name">{project.project}</span>
            {project.health.kind === 'ready'
              ? <span className="ap-rail-agents">{project.health.board.agentsInFlight}/{project.health.board.concurrencyLimit}</span>
              : null}
            <OrchestratorSummary project={project} watchedSessions={OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId)} />
          </a>
        );
      })}
    </div>
  );
}

export function ProjectRail({ projects, watchedOrchestratorsByTracker, selectedTrackerId }: ProjectRailProperties) {
  const groups = ProjectOrdering.grouped(projects, 'all', '');
  return (
    <nav className="ap-rail" aria-label="Projects">
      <RailGroup title="Active" projects={groups.active} watchedOrchestratorsByTracker={watchedOrchestratorsByTracker} selectedTrackerId={selectedTrackerId} />
      <RailGroup title="Idle" projects={groups.idle} watchedOrchestratorsByTracker={watchedOrchestratorsByTracker} selectedTrackerId={selectedTrackerId} />
    </nav>
  );
}
