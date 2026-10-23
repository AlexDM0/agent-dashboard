import type { PendingQuestion }            from '../../src/shared/DashboardContract.ts';
import { type InboxContextRow, InboxUtil } from '../inbox/InboxUtil.ts';
import { boardHashOf }                     from '../shell/HashRoute.ts';

interface WhyItAsksProperties {
  trackerId:       string;
  pendingQuestion: PendingQuestion;
  onLeave:         () => void;
}

const CONTEXT_ROW_LABELS: Record<InboxContextRow['kind'], string> = { doing: 'Doing', mentions: 'Mentions', said: 'Said' };

function ContextRowValue({ row, trackerId, onLeave }: { row: InboxContextRow; trackerId: string; onLeave: () => void }) {
  if (row.kind === 'doing') return <dd className="mono">dispatcher run {row.dispatcherRunId}</dd>;
  if (row.kind === 'said') return <dd className="ap-chat-context-said">“{row.line}”</dd>;
  return (
    <dd className="ap-chat-context-mentions">
      {row.ticketIds.map((ticketId) => (
        <a key={ticketId} className="mono" href={boardHashOf(trackerId)} onClick={onLeave}>#{ticketId}</a>
      ))}
    </dd>
  );
}

/** The pending question's own context, as text; nothing at all when the question carries none. */
export function WhyItAsks({ trackerId, pendingQuestion, onLeave }: WhyItAsksProperties) {
  const rows = InboxUtil.contextRowsOf(pendingQuestion.context);
  if (rows.length === 0) return null;
  return (
    <section className="ap-chat-context-section" aria-label="Why it asks">
      <h3 className="ap-chat-context-title">Why it asks</h3>
      <dl className="ap-chat-context-rows">
        {rows.map((row) => (
          <div key={row.kind} className="ap-chat-context-row">
            <dt className="muted">{CONTEXT_ROW_LABELS[row.kind]}</dt>
            <ContextRowValue row={row} trackerId={trackerId} onLeave={onLeave} />
          </div>
        ))}
      </dl>
    </section>
  );
}
