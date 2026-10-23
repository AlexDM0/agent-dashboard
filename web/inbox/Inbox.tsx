import { useId, useRef, useState } from 'react';
import { useDismissablePopover }   from '../popover/UseDismissablePopover.ts';
import { PendingQuestionForm }     from '../questions/PendingQuestionForm.tsx';
import { boardHashOf }             from '../shell/HashRoute.ts';
import { TimeUtil }                from '../time/TimeUtil.ts';
import type { InboxEntry }         from './InboxUtil.ts';

interface InboxProperties {
  entries: InboxEntry[];
  now:     number;
}

function InboxEntryCard({ entry, now, onLeave }: { entry: InboxEntry; now: number; onLeave: () => void }) {
  const age = TimeUtil.relativeAgeOfStamp(entry.pendingQuestion.askedAt, now);
  return (
    <li className="ap-inbox-entry">
      <div className="ap-inbox-entry-head">
        <a className="ap-inbox-project" href={boardHashOf(entry.trackerId)} onClick={onLeave}>{entry.project}</a>
        {age === '' ? null : <span className="muted ap-inbox-age">waiting {age}</span>}
      </div>
      <PendingQuestionForm trackerId={entry.trackerId} pendingQuestion={entry.pendingQuestion} />
    </li>
  );
}

/** Every question the orchestrators owe, answerable in place; an entry leaves when a snapshot no longer holds it. */
export function Inbox({ entries, now }: InboxProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const inboxReference = useRef<HTMLDivElement | null>(null);
  const toggleReference = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const pendingCount = entries.length;

  useDismissablePopover({
    isOpen, containerReference: inboxReference, toggleReference, close: () => setIsOpen(false)
  });

  return (
    <div ref={inboxReference} className="ap-inbox">
      <button
        ref={toggleReference}
        type="button"
        className="ap-control ap-inbox-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`Inbox, ${String(pendingCount)} ${pendingCount === 1 ? 'question' : 'questions'} waiting`}
        data-pending={pendingCount > 0}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        Inbox <span className="ap-inbox-count">{pendingCount}</span>
      </button>
      {isOpen
        ? (
          <section id={panelId} className="ap-inbox-panel" aria-label="Questions waiting">
            <h2 className="ap-inbox-title">Questions waiting</h2>
            {pendingCount === 0
              ? <p className="muted ap-inbox-empty">No orchestrator is waiting for an answer.</p>
              : (
                <ol className="ap-inbox-list">
                  {entries.map((entry) => (
                    <InboxEntryCard key={`${entry.trackerId}:${entry.pendingQuestion.requestId}`} entry={entry} now={now} onLeave={() => setIsOpen(false)} />
                  ))}
                </ol>
              )}
          </section>
        )
        : null}
    </div>
  );
}
