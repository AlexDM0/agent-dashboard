import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { RootPathUtil }                              from '../board/RootPathUtil.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                              from '../orchestrator/SessionGlyph.tsx';
import { DispatcherPill }                            from '../shell/DispatcherPill.tsx';
import { projectActivityOf }                         from '../shell/ProjectActivity.ts';
import { ProjectDot }                                from '../shell/ProjectDot.tsx';
import { shortOriginOf }                             from './OriginShortening.ts';

interface CardIdentityProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  homeDirectory:   string | null;
}

/** The card's head: the project's dot, name, crew glyphs as the rail draws them and the dispatcher pill; under it where it lives. */
export function CardIdentity({ project, watchedSessions, homeDirectory }: CardIdentityProperties) {
  const leadingOrchestrator = OrchestratorSessionUtil.sessionsOf(project, watchedSessions)[0] ?? null;
  return (
    <div className="ap-card-section ap-card-identity">
      <div className="ap-card-title-row">
        <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
        <h3 className="ap-card-name ellipsis" title={project.project}>{project.project}</h3>
        <span className="ap-card-glyphs">
          <SessionGlyph role="orchestrator" session={leadingOrchestrator} />
          <SessionGlyph role="product-owner" session={project.productOwner} />
        </span>
        {project.health.kind === 'ready'
          ? <DispatcherPill dispatcherState={project.health.board.dispatcherState} />
          : <span className="ap-pill is-error">{project.health.kind}</span>}
      </div>
      <div className="ap-card-paths">
        <span className="ellipsis" title={project.root}>{RootPathUtil.shortenedRootOf(project.root, homeDirectory)}</span>
        {project.gitOrigin === null ? null : <span className="ellipsis" title={project.gitOrigin}>{shortOriginOf(project.gitOrigin)}</span>}
      </div>
    </div>
  );
}
