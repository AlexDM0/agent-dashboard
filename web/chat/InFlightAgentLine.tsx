import type { ActiveRow, ActiveRowKind } from '../../src/shared/DashboardContract.ts';

const KIND_PILLS: Record<ActiveRowKind, { word: string; palette: string }> = {
  build:  { word: 'building', palette: 'in-progress' },
  review: { word: 'reviewing', palette: 'in-review' },
  task:   { word: 'task', palette: 'pending' },
};

interface InFlightAgentLineProperties {
  row:        ActiveRow;
  /** Puts the agent's ticket into the project orchestrator's composer; absent, the line is display only. */
  onMention?: (ticketId: string) => void;
}

/** A builder, reviewer or task agent in flight: it runs inside the dispatcher workflow and takes no message of its own. */
export function InFlightAgentLine({ row, onMention }: InFlightAgentLineProperties) {
  const pill = KIND_PILLS[row.kind];
  const { ticketId } = row;
  const contents = (
    <>
      <span className="ap-pill" data-state={pill.palette}>{pill.word}</span>
      {ticketId === null ? null : <span className="mono">#{ticketId}</span>}
      <span className="ellipsis" title={row.title}>{row.title}</span>
    </>
  );
  if (onMention === undefined || ticketId === null) return <span className="ap-chat-agent-line">{contents}</span>;
  return (
    <button
      type="button"
      className="ap-chat-agent-line is-mentionable"
      title={`Mention #${ticketId} to the orchestrator`}
      aria-label={`${pill.word} #${ticketId} ${row.title}: mention it to the orchestrator`}
      onClick={() => onMention(ticketId)}
    >
      {contents}
    </button>
  );
}
