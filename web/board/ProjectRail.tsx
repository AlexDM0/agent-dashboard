import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }                              from '../orchestrator/SessionGlyph.tsx';
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

interface RailRowProperties {
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  isSelected:      boolean;
}

/** One line on a fixed column grid, so the glyphs, agent counts and badges line up from row to row. */
function RailRow({ project, watchedSessions, isSelected }: RailRowProperties) {
  const leadingSession = OrchestratorSessionUtil.sessionsOf(project, watchedSessions)[0] ?? null;
  const questionCount = OrchestratorSessionUtil.questionCountOf(project);
  return (
    <a
      href={boardHashOf(project.trackerId)}
      className={isSelected ? 'ap-rail-row is-selected' : 'ap-rail-row'}
      {...(isSelected ? { 'aria-current': 'page' as const } : {})}
    >
      <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={questionCount > 0} />
      <span className="ap-rail-name" title={project.project}>{project.project}</span>
      <SessionGlyph role="orchestrator" session={leadingSession} />
      <SessionGlyph role="product-owner" session={OrchestratorSessionUtil.shownProductOwnerOf(project)} />
      <span className="ap-rail-agents">
        {project.health.kind === 'ready' ? `${String(project.health.board.agentsInFlight)}/${String(project.health.board.concurrencyLimit)}` : ''}
      </span>
      <span
        className="ap-rail-question-count"
        data-hidden={questionCount === 0}
        {...(questionCount === 0 ? { 'aria-hidden': true } : { 'aria-label': `${String(questionCount)} ${questionCount === 1 ? 'question' : 'questions'} waiting` })}
      >
        {questionCount}
      </span>
    </a>
  );
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
      {projects.map((project) => (
        <RailRow
          key={project.trackerId}
          project={project}
          watchedSessions={OrchestratorSessionUtil.watchedSessionsOf(watchedOrchestratorsByTracker, project.trackerId)}
          isSelected={project.trackerId === selectedTrackerId}
        />
      ))}
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
