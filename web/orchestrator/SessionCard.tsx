import type { OrchestratorSession }    from '../../src/shared/DashboardContract.ts';
import { TimeUtil }                    from '../time/TimeUtil.ts';
import { ChatBox }                     from './ChatBox.tsx';
import { ContextMeter }                from './ContextMeter.tsx';
import { ConversationLog }             from './ConversationLog.tsx';
import { stopOrchestrator }            from './OrchestratorSessionDelivery.ts';
import { OrchestratorSessionUtil }     from './OrchestratorSessionUtil.ts';
import { PendingQuestionForm }         from './PendingQuestionForm.tsx';
import { SessionStateBadge }           from './SessionStateBadge.tsx';
import { useOrchestratorConversation } from './UseOrchestratorConversation.ts';
import { useSessionRequest }           from './UseSessionRequest.ts';

interface SessionCardProperties {
  trackerId: string;
  session:   OrchestratorSession;
}

function DashboardSessionDetails({ trackerId, session }: { trackerId: string; session: OrchestratorSession }) {
  const messages = useOrchestratorConversation(trackerId);
  const stopRequest = useSessionRequest();
  const hasEnded = session.state === 'ended';
  return (
    <>
      {hasEnded
        ? null
        : session.pendingQuestions.map((pendingQuestion) => (
          <PendingQuestionForm key={pendingQuestion.requestId} trackerId={trackerId} pendingQuestion={pendingQuestion} />
        ))}
      <ConversationLog messages={messages} />
      {hasEnded
        ? null
        : (
          <div className="ap-session-actions">
            <button
              type="button"
              className="ap-control"
              disabled={stopRequest.isSending}
              onClick={() => void stopRequest.send(() => stopOrchestrator(trackerId))}
            >
              {stopRequest.isSending ? 'Stopping…' : 'Stop'}
            </button>
            {stopRequest.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{stopRequest.refusal}</span>}
          </div>
        )}
    </>
  );
}

/** A watched session offers neither Stop nor answers: it was not started here, and its questions are answered in its own app. */
export function SessionCard({ trackerId, session }: SessionCardProperties) {
  const sessionName = OrchestratorSessionUtil.nameOf(session);
  return (
    <section className="ap-session" aria-label={sessionName}>
      <header className="ap-session-head">
        <span className="ap-session-name ellipsis" title={sessionName}>{sessionName}</span>
        <SessionStateBadge session={session} />
      </header>
      <div className="ap-session-meta">
        <ContextMeter context={session.context} />
        {session.startedAt === null
          ? null
          : <span className="mono muted ap-session-started" title={session.startedAt}>started {TimeUtil.clockOfInstant(Date.parse(session.startedAt))}</span>}
      </div>
      {session.ownership === 'dashboard' ? <DashboardSessionDetails trackerId={trackerId} session={session} /> : null}
      <ChatBox trackerId={trackerId} sessionId={session.sessionId} sessionName={sessionName} hasEnded={session.state === 'ended'} />
    </section>
  );
}
