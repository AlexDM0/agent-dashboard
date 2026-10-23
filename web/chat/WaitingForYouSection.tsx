import { SessionGlyph }                                            from '../orchestrator/SessionGlyph.tsx';
import { TimeUtil }                                                from '../time/TimeUtil.ts';
import { type DockedWaiting, type WaitingItem, WaitingForYouUtil } from './WaitingForYouUtil.ts';

interface WaitingForYouSectionProperties {
  items:           WaitingItem[];
  selectedItemKey: string | null;
  now:             number;
  onSelect:        (conversationKey: string, docked: DockedWaiting) => void;
}

function firstLineOf(text: string): string {
  return text.split('\n', 1)[0]?.trim() ?? '';
}

function textOf(item: WaitingItem): string {
  if (item.kind === 'alert') return `Context at ${String(item.alert.contextPercent)}%: refresh the orchestrator`;
  return firstLineOf(item.entry.pendingQuestion.questions[0]?.question ?? '');
}

function ageOf(item: WaitingItem, now: number): string {
  const stamp = item.kind === 'alert' ? item.alert.session.context?.measuredAt ?? null : item.entry.pendingQuestion.askedAt;
  return stamp === null ? '' : TimeUtil.relativeAgeOfStamp(stamp, now);
}

/** Every question and critical context across the projects, in the inbox's order; a row selects its session with its card docked. */
export function WaitingForYouSection({
  items, selectedItemKey, now, onSelect
}: WaitingForYouSectionProperties) {
  if (items.length === 0) return null;
  return (
    <section className="ap-chat-waiting-section" aria-label="Waiting for you">
      <h3 className="ap-chat-project-heading">
        <span>Waiting for you</span>
        <span className="ap-chat-question-badge" aria-hidden="true">{items.length}</span>
      </h3>
      <ul className="ap-chat-list">
        {items.map((item) => {
          const role = item.kind === 'alert' ? 'orchestrator' : item.entry.role;
          const session = item.kind === 'alert' ? item.alert.session : item.entry.session;
          const project = item.kind === 'alert' ? item.alert.project : item.entry.project;
          const age = ageOf(item, now);
          return (
            <li key={item.key}>
              <button
                type="button"
                className="ap-chat-list-entry ap-chat-waiting-entry"
                data-kind={item.kind}
                aria-current={item.key === selectedItemKey}
                onClick={() => onSelect(item.conversationKey, WaitingForYouUtil.dockedOf(item))}
              >
                <SessionGlyph role={role} session={session} />
                <span className="ap-chat-list-text">
                  <span className="ap-chat-list-name ellipsis" title={textOf(item)}>{textOf(item)}</span>
                  <span className="muted ap-chat-list-status">
                    <span className="ellipsis">{project}</span>
                    <span>{item.kind}</span>
                    {age === '' ? null : <span className="mono">{age}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
