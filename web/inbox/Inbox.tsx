import { useId, useRef, useState }                  from 'react';
import { useDismissablePopover }                    from '../popover/UseDismissablePopover.ts';
import { InboxAlertCard }                           from './InboxAlertCard.tsx';
import { InboxQuestionCard }                        from './InboxQuestionCard.tsx';
import type { InboxAlert, InboxEntry, InboxFilter } from './InboxUtil.ts';

interface InboxProperties {
  entries: InboxEntry[];
  alerts:  InboxAlert[];
  now:     number;
}

const FILTERS: { filter: InboxFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'questions', label: 'Questions' },
  { filter: 'alerts', label: 'Alerts' },
];

function countPhraseOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** Every question the orchestrators and product owners owe, answerable in place, and every critical context; each leaves once a snapshot drops it. */
export function Inbox({ entries, alerts, now }: InboxProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const inboxReference = useRef<HTMLDivElement | null>(null);
  const toggleReference = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const waitingCount = entries.length + alerts.length;
  const shownEntries = filter === 'alerts' ? [] : entries;
  const shownAlerts = filter === 'questions' ? [] : alerts;
  const close = (): void => setIsOpen(false);

  useDismissablePopover({
    isOpen, containerReference: inboxReference, toggleReference, close
  });

  return (
    <div ref={inboxReference} className="ap-inbox">
      <button
        ref={toggleReference}
        type="button"
        className="ap-control ap-inbox-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`Inbox, ${countPhraseOf(entries.length, 'question')} and ${countPhraseOf(alerts.length, 'alert')} waiting`}
        data-pending={waitingCount > 0}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        Inbox <span className="ap-inbox-count">{waitingCount}</span>
      </button>
      {isOpen
        ? (
          <section id={panelId} className="ap-inbox-panel" aria-label="Inbox">
            <div className="ap-inbox-panel-head">
              <h2 className="ap-inbox-title">Inbox</h2>
              <div className="ap-seg" role="group" aria-label="Show entries">
                {FILTERS.map((option) => (
                  <button key={option.filter} type="button" aria-pressed={filter === option.filter} onClick={() => setFilter(option.filter)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {shownEntries.length + shownAlerts.length === 0
              ? <p className="muted ap-inbox-empty">No orchestrator or product owner is waiting for an answer or a refresh.</p>
              : (
                <ol className="ap-inbox-list">
                  {shownAlerts.map((alert) => <InboxAlertCard key={`alert:${alert.trackerId}`} alert={alert} onLeave={close} />)}
                  {shownEntries.map((entry) => (
                    <InboxQuestionCard key={`${entry.trackerId}:${entry.pendingQuestion.requestId}`} entry={entry} now={now} onLeave={close} />
                  ))}
                </ol>
              )}
          </section>
        )
        : null}
    </div>
  );
}
