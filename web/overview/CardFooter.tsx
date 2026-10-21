import type { ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { TimeUtil }             from '../time/TimeUtil.ts';
import { OpenBoardButton }      from './OpenBoardButton.tsx';

interface CardFooterProperties {
  project: ProjectSnapshot;
  canOpen: boolean;
  now:     number;
}

export function CardFooter({ project, canOpen, now }: CardFooterProperties) {
  return (
    <div className="ap-card-section ap-card-footer">
      <span className="muted ap-card-changed">
        Changed <span className="mono">{TimeUtil.relativeAgeOfStamp(project.lastChangedAt, now)} ago</span> · <span className="mono">{project.lastCommand}</span>
      </span>
      {canOpen ? <OpenBoardButton trackerId={project.trackerId} projectName={project.project} /> : <span className="muted ap-card-changed">No page to open</span>}
    </div>
  );
}
