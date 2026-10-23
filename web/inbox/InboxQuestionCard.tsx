import type { SessionRole }                                 from '../../src/shared/DashboardContract.ts';
import { SessionGlyph }                                     from '../orchestrator/SessionGlyph.tsx';
import { PendingQuestionForm }                              from '../questions/PendingQuestionForm.tsx';
import { boardHashOf, crewDrawerHashOf }                    from '../shell/HashRoute.ts';
import { TimeUtil }                                         from '../time/TimeUtil.ts';
import { type InboxContextRow, type InboxEntry, InboxUtil } from './InboxUtil.ts';

interface InboxQuestionCardProperties {
  entry:   InboxEntry;
  now:     number;
  onLeave: () => void;
}

function ContextRowValue({ row, trackerId, onLeave }: { row: InboxContextRow; trackerId: string; onLeave: () => void }) {
  if (row.kind === 'doing') return <dd className="mono">dispatcher run {row.dispatcherRunId}</dd>;
  if (row.kind === 'said') return <dd className="ap-inbox-said">“{row.line}”</dd>;
  return (
    <dd className="ap-inbox-mentions">
      {row.ticketIds.map((ticketId) => (
        <a key={ticketId} className="mono" href={boardHashOf(trackerId)} onClick={onLeave}>#{ticketId}</a>
      ))}
    </dd>
  );
}

const CONTEXT_ROW_LABELS: Record<InboxContextRow['kind'], string> = { doing: 'Doing', mentions: 'Mentions', said: 'Said' };

const ROLE_WORDS: Record<SessionRole, string> = { 'orchestrator': 'orchestrator', 'product-owner': 'product owner' };

/** Who asks and why above the shared question card, and a way into the conversation under it. */
export function InboxQuestionCard({ entry, now, onLeave }: InboxQuestionCardProperties) {
  const age = TimeUtil.relativeAgeOfStamp(entry.pendingQuestion.askedAt, now);
  const contextRows = InboxUtil.contextRowsOf(entry.pendingQuestion.context);
  return (
    <li className="ap-inbox-entry" data-kind="question">
      <div className="ap-inbox-entry-head">
        <SessionGlyph role={entry.role} session={entry.session} />
        <a className="ap-inbox-project" href={boardHashOf(entry.trackerId)} onClick={onLeave}>{entry.project}</a>
        <span className="muted ap-inbox-role">{ROLE_WORDS[entry.role]}</span>
        <span className="ap-inbox-hosted">hosted</span>
        {age === '' ? null : <span className="muted ap-inbox-age">waiting {age}</span>}
      </div>
      {contextRows.length === 0
        ? null
        : (
          <dl className="ap-inbox-context">
            {contextRows.map((row) => (
              <div key={row.kind} className="ap-inbox-context-row">
                <dt className="muted">{CONTEXT_ROW_LABELS[row.kind]}</dt>
                <ContextRowValue row={row} trackerId={entry.trackerId} onLeave={onLeave} />
              </div>
            ))}
          </dl>
        )}
      <PendingQuestionForm role={entry.role} trackerId={entry.trackerId} pendingQuestion={entry.pendingQuestion} />
      <a className="ap-inbox-open-conversation" href={crewDrawerHashOf(entry.trackerId)} onClick={onLeave}>Open conversation</a>
    </li>
  );
}
