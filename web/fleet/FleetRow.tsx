import type {
  BoardSummary,
  OrchestratorSession,
  ProjectSnapshot,
  SessionRole
} from '../../src/shared/DashboardContract.ts';
import { ContextMeter }            from '../orchestrator/ContextMeter.tsx';
import { OrchestratorSessionUtil } from '../orchestrator/OrchestratorSessionUtil.ts';
import { SessionGlyph }            from '../orchestrator/SessionGlyph.tsx';
import { StartOrchestratorButton } from '../orchestrator/StartOrchestratorButton.tsx';
import { StartProductOwnerButton } from '../orchestrator/StartProductOwnerButton.tsx';
import { ConcurrencyStepper }      from '../shell/ConcurrencyStepper.tsx';
import { DispatcherPill }          from '../shell/DispatcherPill.tsx';
import { boardHashOf }             from '../shell/HashRoute.ts';
import { projectActivityOf }       from '../shell/ProjectActivity.ts';
import { ProjectDot }              from '../shell/ProjectDot.tsx';
import { TimeUtil }                from '../time/TimeUtil.ts';
import { FleetRunCell }            from './FleetRunCell.tsx';
import { FleetUtil }               from './FleetUtil.ts';

interface FleetRowProperties {
  project:            ProjectSnapshot;
  watchedSessions:    OrchestratorSession[];
  now:                number;
  onOpenChat:         () => void;
  onOpenProductOwner: () => void;
}

function SessionLine({ role, session, now }: { role: SessionRole; session: OrchestratorSession; now: number }) {
  return (
    <div className="ap-fleet-crew-line" data-role={role}>
      <SessionGlyph role={role} session={session} />
      <span className="ap-pill" data-state={OrchestratorSessionUtil.statePaletteOf(session.state, role)}>{OrchestratorSessionUtil.stateWordOf(session.state)}</span>
      <ContextMeter context={session.context} compact />
      {session.lastAction === null
        ? null
        : (
          // The age leads, so a narrow column cuts the text short rather than the age.
          <span className="ap-fleet-action" title={session.lastAction.text}>
            <span className="mono muted ap-fleet-action-age">{TimeUtil.agoPhraseOfStamp(session.lastAction.at, now)}</span>
            <span className="ellipsis">{session.lastAction.text}</span>
          </span>
        )}
    </div>
  );
}

interface CrewCellProperties {
  project:            ProjectSnapshot;
  session:            OrchestratorSession | null;
  now:                number;
  onOpenProductOwner: () => void;
}

/** The orchestrator's line, then the product owner's, or the offer to start one when none lives. */
function CrewCell({
  project, session, now, onOpenProductOwner
}: CrewCellProperties) {
  const productOwner = OrchestratorSessionUtil.shownProductOwnerOf(project);
  return (
    <div className="ap-fleet-cell ap-fleet-crew" role="cell">
      {session === null
        ? (
          <div className="ap-fleet-crew-line">
            <span className="muted">No orchestrator</span>
            {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton project={project} /> : null}
          </div>
        )
        : <SessionLine role="orchestrator" session={session} now={now} />}
      {productOwner === null
        ? (
          <div className="ap-fleet-crew-line" data-role="product-owner">
            <StartProductOwnerButton project={project} label="+ Ask PO for a ticket" onOpened={onOpenProductOwner} />
          </div>
        )
        : <SessionLine role="product-owner" session={productOwner} now={now} />}
    </div>
  );
}

function QueueCell({ board }: { board: BoardSummary }) {
  const { readyCount, quietParts } = FleetUtil.queueSummaryOf(board);
  return (
    <div className="ap-fleet-cell ap-fleet-queue" role="cell">
      <span className="mono">{readyCount} ready</span>
      {quietParts.length === 0 ? null : <span className="mono muted">{quietParts.join(' · ')}</span>}
    </div>
  );
}

/** One project on one line from about 950 px; under it the cells wrap onto a second line, never wider than the table. */
export function FleetRow({
  project, watchedSessions, now, onOpenChat, onOpenProductOwner
}: FleetRowProperties) {
  const leadingSession = OrchestratorSessionUtil.sessionsOf(project, watchedSessions)[0] ?? null;
  const board = project.health.kind === 'ready' ? project.health.board : null;
  return (
    <div className="ap-fleet-row" role="row">
      <div className="ap-fleet-cell ap-fleet-project" role="rowheader">
        <ProjectDot activity={projectActivityOf(project)} isQuestionWaiting={OrchestratorSessionUtil.isQuestionWaiting(project)} />
        <a className="ap-fleet-name" href={boardHashOf(project.trackerId)} title={project.project}>{project.project}</a>
        {board === null ? <span className="ap-pill is-error">{project.health.kind}</span> : <DispatcherPill dispatcherState={board.dispatcherState} />}
      </div>
      <CrewCell project={project} session={leadingSession} now={now} onOpenProductOwner={onOpenProductOwner} />
      {board === null
        ? <div className="ap-fleet-cell ap-fleet-unreadable" role="cell"><span className="muted">Board not readable</span></div>
        : (
          <>
            <div className="ap-fleet-cell ap-fleet-agents" role="cell">
              <span className="mono" role="img" aria-label={`${String(board.agentsInFlight)} of ${String(board.concurrencyLimit)} slots busy`}>
                {board.agentsInFlight}/{board.concurrencyLimit}
              </span>
              <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={board.concurrencyLimit} />
            </div>
            <QueueCell board={board} />
            <FleetRunCell project={project} board={board} onOpenChat={onOpenChat} />
          </>
        )}
    </div>
  );
}
