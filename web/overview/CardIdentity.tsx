import type { ProjectSnapshot }    from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil } from '../orchestrator/OrchestratorSessionUtil.ts';
import { DispatcherPill }          from '../shell/DispatcherPill.tsx';
import { projectActivityOf }       from '../shell/ProjectActivity.ts';
import { ProjectDot }              from '../shell/ProjectDot.tsx';
import { shortOriginOf }           from './OriginShortening.ts';

interface CardIdentityProperties {
  project: ProjectSnapshot;
}

export function CardIdentity({ project }: CardIdentityProperties) {
  return (
    <div className="ap-card-section ap-card-identity">
      <div className="ap-card-title-row">
        <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
        <h3 className="ap-card-name ellipsis">{project.project}</h3>
        {project.health.kind === 'ready'
          ? <DispatcherPill dispatcherState={project.health.board.dispatcherState} />
          : <span className="ap-pill is-error">{project.health.kind}</span>}
      </div>
      <div className="ap-card-paths">
        <span className="ellipsis" title={project.root}>{project.root}</span>
        {project.gitOrigin === null ? null : <span>{shortOriginOf(project.gitOrigin)}</span>}
      </div>
    </div>
  );
}
