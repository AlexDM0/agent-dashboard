import type { ReactNode }                                  from 'react';
import type { BoardSummary, ChatMessage, PendingQuestion } from '../../src/shared/DashboardContract.ts';
import { ContextMeter }                                    from '../orchestrator/ContextMeter.tsx';
import { DispatcherPill }                                  from '../shell/DispatcherPill.tsx';
import { TimeUtil }                                        from '../time/TimeUtil.ts';
import { ChatContextUtil }                                 from './ChatContextUtil.ts';
import type { ChatConversation }                           from './ChatConversationListUtil.ts';
import { CrewBlock }                                       from './CrewBlock.tsx';
import { OnTheTable }                                      from './OnTheTable.tsx';
import { SparTableUtil }                                   from './SparTableUtil.ts';
import { TicketStatusPill }                                from './TicketStatusPill.tsx';
import { WhyItAsks }                                       from './WhyItAsks.tsx';

/** The project's crew as the Context column lists it, and whether a product owner can be started there. */
export interface ChatCrew {
  conversations:        ChatConversation[];
  canStartProductOwner: boolean;
}

interface ChatContextColumnProperties {
  conversation:    ChatConversation;
  board:           BoardSummary | null;
  messages:        ChatMessage[];
  /** The question docked above the composer, whose context opens the column. */
  pendingQuestion: PendingQuestion | null;
  crew:            ChatCrew;
  now:             number;
  onSelect:        (key: string) => void;
  onLeave:         () => void;
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="ap-chat-fact">
      <dt className="muted">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What the conversation stands on: why it asks, the session, its board, the tickets it names, the project's crew and a product owner's table. */
export function ChatContextColumn({
  conversation, board, messages, pendingQuestion, crew, now, onSelect, onLeave
}: ChatContextColumnProperties) {
  const { session, projectName, role } = conversation;
  const mentionedTickets = ChatContextUtil.mentionedTicketsOf(messages, session.pendingQuestions, board);
  const sparTable = role === 'product-owner' ? SparTableUtil.latestTableOf(messages) : null;
  return (
    <aside className="ap-chat-column ap-chat-context-column" aria-label="Context">
      <h2 className="ap-chat-column-title">Context</h2>
      {pendingQuestion === null ? null : <WhyItAsks trackerId={conversation.trackerId} pendingQuestion={pendingQuestion} onLeave={onLeave} />}
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
      <CrewBlock
        trackerId={conversation.trackerId}
        projectName={projectName}
        crew={crew.conversations}
        selectedKey={conversation.key}
        canStartProductOwner={crew.canStartProductOwner}
        onSelect={onSelect}
      />
      {sparTable === null ? null : <OnTheTable table={sparTable} board={board} />}
    </aside>
  );
}
