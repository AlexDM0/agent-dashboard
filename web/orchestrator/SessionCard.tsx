import type { OrchestratorSession }               from '../../src/shared/DashboardContract.ts';
import { PendingQuestionForm }                    from '../questions/PendingQuestionForm.tsx';
import { TimeUtil }                               from '../time/TimeUtil.ts';
import { ChatBox }                                from './ChatBox.tsx';
import { ContextMeter }                           from './ContextMeter.tsx';
import { ContextUsageUtil }                       from './ContextUsageUtil.ts';
import { ConversationLog }                        from './ConversationLog.tsx';
import { OrchestratorMenu }                       from './OrchestratorMenu.tsx';
import { OrchestratorSessionUtil }                from './OrchestratorSessionUtil.ts';
import { SessionStateBadge }                      from './SessionStateBadge.tsx';
import { useOrchestratorConversation }            from './UseOrchestratorConversation.ts';
import { type SessionRequest, useSessionRequest } from './UseSessionRequest.ts';

interface SessionCardProperties {
  trackerId: string;
  session:   OrchestratorSession;
}

interface DashboardSessionDetailsProperties {
  trackerId:      string;
  session:        OrchestratorSession;
  refreshRequest: SessionRequest;
  stopRequest:    SessionRequest;
}

function RequestNote({ request, sendingText }: { request: SessionRequest; sendingText: string }) {
  if (request.isSending) return <span className="muted ap-session-request-note" role="status">{sendingText}</span>;
  return request.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{request.refusal}</span>;
}

function DashboardSessionDetails({
  trackerId, session, refreshRequest, stopRequest
}: DashboardSessionDetailsProperties) {
  const messages = useOrchestratorConversation(trackerId);
  const hasEnded = session.state === 'ended';
  const isRefreshSuggested = ContextUsageUtil.suggestsHandoff(session.context);
  const hasNotes = isRefreshSuggested || [refreshRequest, stopRequest].some((request) => request.isSending || request.refusal !== null);
  return (
    <>
      {hasEnded
        ? null
        : session.pendingQuestions.map((pendingQuestion) => (
          <PendingQuestionForm key={pendingQuestion.requestId} trackerId={trackerId} pendingQuestion={pendingQuestion} />
        ))}
      <ConversationLog messages={messages} />
      {hasEnded || !hasNotes
        ? null
        : (
          <div className="ap-session-actions">
            {isRefreshSuggested
              ? (
                <p className="ap-handoff-warning" role="status">
                  Context {ContextUsageUtil.captionOf(session.context)}: refresh this orchestrator before it compacts.
                </p>
              )
              : null}
            <RequestNote request={stopRequest} sendingText="Stopping…" />
            <RequestNote request={refreshRequest} sendingText="Refreshing…" />
          </div>
        )}
    </>
  );
}

/** A watched session offers neither the menu nor answers: it was not started here, and its questions are answered in its own app. */
export function SessionCard({ trackerId, session }: SessionCardProperties) {
  const sessionName = OrchestratorSessionUtil.nameOf(session);
  const refreshRequest = useSessionRequest();
  const stopRequest = useSessionRequest();
  const isDashboardOwned = session.ownership === 'dashboard';
  return (
    <section className="ap-session" aria-label={sessionName}>
      <header className="ap-session-head">
        {isDashboardOwned && session.state !== 'ended'
          ? <OrchestratorMenu trackerId={trackerId} session={session} refreshRequest={refreshRequest} stopRequest={stopRequest} />
          : null}
        <span className="ap-session-name ellipsis" title={sessionName}>{sessionName}</span>
        <SessionStateBadge session={session} />
      </header>
      <div className="ap-session-meta">
        <ContextMeter context={session.context} />
        {session.startedAt === null
          ? null
          : <span className="mono muted ap-session-started" title={session.startedAt}>started {TimeUtil.clockOfInstant(Date.parse(session.startedAt))}</span>}
      </div>
      {isDashboardOwned
        ? <DashboardSessionDetails trackerId={trackerId} session={session} refreshRequest={refreshRequest} stopRequest={stopRequest} />
        : null}
      <ChatBox trackerId={trackerId} sessionId={session.sessionId} sessionName={sessionName} hasEnded={session.state === 'ended'} />
    </section>
  );
}
