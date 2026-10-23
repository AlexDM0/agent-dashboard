import { TimeUtil }           from '../time/TimeUtil.ts';
import type { AttentionCard } from './FleetUtil.ts';

interface NeedsYouColumnProperties {
  cards:  AttentionCard[];
  now:    number;
  /** Opens the chat window on the card's entry in its Waiting for you section. */
  onOpen: (card: AttentionCard) => void;
}

function cardKeyOf(card: AttentionCard): string {
  return card.kind === 'question' ? `question:${card.trackerId}:${card.requestId}` : `handoff:${card.trackerId}`;
}

function AttentionCardButton({ card, now, onOpen }: { card: AttentionCard; now: number; onOpen: (card: AttentionCard) => void }) {
  if (card.kind === 'question') {
    return (
      <button type="button" className="ap-attention-card" onClick={() => onOpen(card)}>
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
    <button type="button" className="ap-attention-card" data-kind="handoff" onClick={() => onOpen(card)}>
      <span className="ap-attention-head">
        <span className="ap-attention-project">{card.project}</span>
        <span className="mono muted ap-attention-age">{TimeUtil.relativeAgeOfStamp(card.measuredAt, now)}</span>
      </span>
      <span className="muted ap-attention-who">Orchestrator context {card.contextCaption}</span>
      <span className="ap-attention-text">Refresh the orchestrator</span>
    </button>
  );
}

export function NeedsYouColumn({ cards, now, onOpen }: NeedsYouColumnProperties) {
  return (
    <aside className="ap-needs-you" aria-label="Needs you">
      <h2 className="ap-needs-you-title">Needs you <span className="mono muted">{cards.length}</span></h2>
      {cards.length === 0
        ? <p className="muted ap-caption">Nothing waits for an answer.</p>
        : (
          <ol className="ap-needs-you-list">
            {cards.map((card) => <li key={cardKeyOf(card)}><AttentionCardButton card={card} now={now} onOpen={onOpen} /></li>)}
          </ol>
        )}
    </aside>
  );
}
