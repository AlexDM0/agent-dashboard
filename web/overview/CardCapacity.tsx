import type { BoardSummary, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { BoardCommandControls }               from '../board/BoardCommandControls.tsx';
import { ConcurrencyStepper }                 from '../shell/ConcurrencyStepper.tsx';
import { SlotMeter }                          from '../shell/SlotMeter.tsx';
import { TimeUtil }                           from '../time/TimeUtil.ts';

interface CardCapacityProperties {
  project:    ProjectSnapshot;
  board:      BoardSummary;
  /** The last snapshot's instant while the event stream is down, else null. */
  staleSince: number | null;
}

export function waitingCaptionOf(board: BoardSummary): string | null {
  const readyCount = board.readyTicketIds.length;
  return board.agentsInFlight >= board.concurrencyLimit && readyCount > 0 ? `all slots busy · ${String(readyCount)} ready wait` : null;
}

/** One line: the stepper holding the slots it steps, why ready tickets wait, then the dispatcher's actions at the right. */
export function CardCapacity({ project, board, staleSince }: CardCapacityProperties) {
  const waitingCaption = waitingCaptionOf(board);
  return (
    <div className="ap-card-section ap-card-capacity">
      <ConcurrencyStepper trackerId={project.trackerId} projectName={project.project} shownLimit={board.concurrencyLimit}>
        <SlotMeter concurrencyLimit={board.concurrencyLimit} busyCount={board.agentsInFlight} compact />
      </ConcurrencyStepper>
      <span className="mono muted ellipsis ap-capacity-caption" title={waitingCaption ?? undefined}>{waitingCaption}</span>
      {staleSince === null ? null : <span className="mono muted ap-meter-as-of">as of {TimeUtil.clockOfInstant(staleSince)}</span>}
      <span className="ap-capacity-actions">
        <BoardCommandControls project={project} board={board} />
      </span>
    </div>
  );
}
