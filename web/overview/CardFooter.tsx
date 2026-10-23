import type { LogLine, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { TimeUtil }                      from '../time/TimeUtil.ts';
import { OpenBoardButton }               from './OpenBoardButton.tsx';

interface CardFooterProperties {
  project:        ProjectSnapshot;
  canOpen:        boolean;
  now:            number;
  latestLogLine?: LogLine | null;
}

/** The board's latest log line, when there is one, then how long ago the tracker changed and the way into the board. */
export function CardFooter({
  project, canOpen, now, latestLogLine = null
}: CardFooterProperties) {
  return (
    <div className="ap-card-section ap-card-footer">
      {latestLogLine === null
        ? <span className="ap-log-line" />
        : (
          <span className="ap-log-line">
            <span className="mono muted ap-log-time">{TimeUtil.logStampText(latestLogLine.at, now)}</span>
            <span className="ellipsis ap-log-text" title={latestLogLine.text}>{latestLogLine.text}</span>
          </span>
        )}
      <span className="muted ap-card-changed" title={project.lastCommand}>
        Changed <span className="mono">{TimeUtil.agoPhraseOfStamp(project.lastChangedAt, now)}</span>
      </span>
      {canOpen ? <OpenBoardButton trackerId={project.trackerId} projectName={project.project} /> : <span className="muted ap-card-changed">No page to open</span>}
    </div>
  );
}
