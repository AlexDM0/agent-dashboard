import type { ReactNode }                 from 'react';
import type { BoardSummary, ChatMessage } from '../../src/shared/DashboardContract.ts';
import { ContextMeter }                   from '../orchestrator/ContextMeter.tsx';
import { DispatcherPill }                 from '../shell/DispatcherPill.tsx';
import { TimeUtil }                       from '../time/TimeUtil.ts';
import { ChatContextUtil }                from './ChatContextUtil.ts';
import type { ChatConversation }          from './ChatConversationListUtil.ts';
import { InFlightAgentLine }              from './InFlightAgentLine.tsx';
import { OnTheTable }                     from './OnTheTable.tsx';
import { SparTableUtil }                  from './SparTableUtil.ts';
import { TicketStatusPill }               from './TicketStatusPill.tsx';

interface ChatContextColumnProperties {
  conversation: ChatConversation;
  board:        BoardSummary | null;
  messages:     ChatMessage[];
  now:          number;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="ap-chat-fact">
      <dt className="muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What the conversation stands on: the session, its board, the tickets it names, the project's other agents and a product owner's table. */
export function ChatContextColumn({
  conversation, board, messages, now
}: ChatContextColumnProperties) {
  const { session, projectName, role } = conversation;
  const mentionedTickets = ChatContextUtil.mentionedTicketsOf(messages, session.pendingQuestions, board);
  const sparTable = role === 'product-owner' ? SparTableUtil.latestTableOf(messages) : null;
  return (
    <aside className="ap-chat-column ap-chat-context-column" aria-label="Context">
      <h2 className="ap-chat-column-title">Context</h2>
      <section className="ap-chat-context-section" aria-label="Session">
        <h3 className="ap-chat-context-title">Session</h3>
        <dl className="ap-chat-facts">
          <Fact term="Started">{session.startedAt === null ? 'not known' : TimeUtil.logStampText(session.startedAt, now)}</Fact>
          <Fact term="Context"><ContextMeter context={session.context} /></Fact>
          <Fact term="Last action">
            {session.lastAction === null
              ? 'none yet'
              : <>{session.lastAction.text} <span className="muted mono">· {TimeUtil.relativeAgeOfStamp(session.lastAction.at, now)}</span></>}
          </Fact>
        </dl>
      </section>
      <section className="ap-chat-context-section" aria-label="Board">
        <h3 className="ap-chat-context-title">Board</h3>
        {board === null
          ? <p className="muted ap-caption">Board not readable</p>
          : (
            <dl className="ap-chat-facts">
              <Fact term="Dispatcher"><DispatcherPill dispatcherState={board.dispatcherState} /></Fact>
              <Fact term="Agents"><span className="mono">{board.agentsInFlight}/{board.concurrencyLimit}</span></Fact>
              <Fact term="Ready"><span className="mono">{board.readyTicketIds.length}</span></Fact>
              <Fact term="Held"><span className="mono">{board.heldTicketIds.length}</span></Fact>
            </dl>
          )}
      </section>
      <section className="ap-chat-context-section" aria-label="Mentioned">
        <h3 className="ap-chat-context-title">Mentioned</h3>
        {mentionedTickets.length === 0
          ? <p className="muted ap-caption">No ticket named yet</p>
          : (
            <ul className="ap-table-list">
              {mentionedTickets.map((ticket) => (
                <li key={ticket.ticketId} className="ap-table-reference"><TicketStatusPill ticketId={ticket.ticketId} status={ticket.status} /></li>
              ))}
            </ul>
          )}
      </section>
      <section className="ap-chat-context-section" aria-label={`Also in ${projectName}`}>
        <h3 className="ap-chat-context-title">Also in {projectName}</h3>
        {board === null || board.activeRows.length === 0
          ? <p className="muted ap-caption">No agent in flight</p>
          : <ul className="ap-chat-agent-lines">{board.activeRows.map((row) => <li key={row.rowId}><InFlightAgentLine row={row} /></li>)}</ul>}
      </section>
      {sparTable === null ? null : <OnTheTable table={sparTable} board={board} />}
    </aside>
  );
}
