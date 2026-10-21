import type { ProjectSnapshot }   from '../../src/shared/DashboardContract.ts';
import { CardFooter }             from './CardFooter.tsx';
import { CardIdentity }           from './CardIdentity.tsx';
import { openBoardFromCardClick } from './CardNavigation.ts';

interface ProblemCardProperties {
  project: ProjectSnapshot;
  reason:  string;
  now:     number;
}

/** An unreadable or missing project: the reason is the CLI's own stderr or the missing path, shown as given. */
export function ProblemCard({ project, reason, now }: ProblemCardProperties) {
  const title = project.health.kind === 'missing' ? 'Project missing' : 'Board unreadable';
  return (
    <article
      className="ap-card is-error"
      aria-label={project.project}
      onClick={project.pageAvailable ? (event) => openBoardFromCardClick(event, project.trackerId) : undefined}
      data-openable={project.pageAvailable}
    >
      <CardIdentity project={project} />
      <div className="ap-card-section ap-problem">
        <span className="ap-queue-label ap-problem-title">{title}</span>
        <p className="ap-reason">{reason}</p>
      </div>
      <CardFooter project={project} canOpen={project.pageAvailable} now={now} />
    </article>
  );
}
