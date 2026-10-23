import { TimeUtil }           from '../time/TimeUtil.ts';
import type { AttentionCard } from './FleetUtil.ts';

interface NeedsYouColumnProperties {
  cards:         AttentionCard[];
  now:           number;
  onOpenHandoff: (trackerId: string) => void;
}

/** The header's Inbox owns its open state, so a card opens it as the user would: by its toggle. */
function openInbox(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.ap-inbox-toggle');
  if (toggle === null) return;
  toggle.scrollIntoView({ block: 'nearest' });
  if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  toggle.focus();
}

function cardKeyOf(card: AttentionCard): string {
  return card.kind === 'question' ? `question:${card.trackerId}:${card.requestId}` : `handoff:${card.trackerId}`;
}

function AttentionCardButton({ card, now, onOpenHandoff }: { card: AttentionCard; now: number; onOpenHandoff: (trackerId: string) => void }) {
  if (card.kind === 'question') {
    return (
      <button type="button" className="ap-attention-card" onClick={openInbox}>
        <span className="ap-attention-head">
          <span className="ap-attention-project">{card.project}</span>
          <span className="mono muted ap-attention-age">{TimeUtil.relativeAgeOfStamp(card.askedAt, now)}</span>
        </span>
        <span className="muted ap-attention-who">{card.role === 'product-owner' ? 'Product owner asks' : 'Orchestrator asks'}</span>
        <span className="ap-attention-text">{card.firstLine}</span>
      </button>
    );
  }
  return (
    <button type="button" className="ap-attention-card" data-kind="handoff" onClick={() => onOpenHandoff(card.trackerId)}>
      <span className="ap-attention-head">
        <span className="ap-attention-project">{card.project}</span>
        <span className="mono muted ap-attention-age">{TimeUtil.relativeAgeOfStamp(card.measuredAt, now)}</span>
      </span>
      <span className="muted ap-attention-who">Orchestrator context {card.contextCaption}</span>
      <span className="ap-attention-text">Refresh the orchestrator</span>
    </button>
  );
}

export function NeedsYouColumn({ cards, now, onOpenHandoff }: NeedsYouColumnProperties) {
  return (
    <aside className="ap-needs-you" aria-label="Needs you">
      <h2 className="ap-needs-you-title">Needs you <span className="mono muted">{cards.length}</span></h2>
      {cards.length === 0
        ? <p className="muted ap-caption">Nothing waits for an answer.</p>
        : (
          <ol className="ap-needs-you-list">
            {cards.map((card) => <li key={cardKeyOf(card)}><AttentionCardButton card={card} now={now} onOpenHandoff={onOpenHandoff} /></li>)}
          </ol>
        )}
    </aside>
  );
}
