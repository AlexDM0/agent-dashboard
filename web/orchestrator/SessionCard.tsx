import type { OrchestratorSession, SessionRole }  from '../../src/shared/DashboardContract.ts';
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
  role:        SessionRole;
  trackerId:   string;
  session:     OrchestratorSession;
  /** An ended session read back from the fold: its conversation without a composer. */
  isReadOnly?: boolean;
}

interface DashboardSessionDetailsProperties {
  role:           SessionRole;
  trackerId:      string;
  session:        OrchestratorSession;
  refreshRequest: SessionRequest;
  stopRequest:    SessionRequest;
}

const STOPPING_TEXTS: Record<SessionRole, string> = { 'orchestrator': 'Stopping…', 'product-owner': 'Ending…' };

function RequestNote({ request, sendingText }: { request: SessionRequest; sendingText: string }) {
  if (request.isSending) return <span className="muted ap-session-request-note" role="status">{sendingText}</span>;
  return request.refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{request.refusal}</span>;
}

function DashboardSessionDetails({
  role, trackerId, session, refreshRequest, stopRequest
}: DashboardSessionDetailsProperties) {
  const messages = useOrchestratorConversation(role, trackerId);
  const hasEnded = session.state === 'ended';
  // Only an orchestrator is refreshed; a product owner near its limit is ended and started afresh.
  const isRefreshSuggested = role === 'orchestrator' && ContextUsageUtil.suggestsHandoff(session.context);
  const hasNotes = isRefreshSuggested || [refreshRequest, stopRequest].some((request) => request.isSending || request.refusal !== null);
  return (
    <>
      {hasEnded
        ? null
        : session.pendingQuestions.map((pendingQuestion) => (
          <PendingQuestionForm key={pendingQuestion.requestId} role={role} trackerId={trackerId} pendingQuestion={pendingQuestion} />
        ))}
      <ConversationLog role={role} messages={messages} />
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
            <RequestNote request={stopRequest} sendingText={STOPPING_TEXTS[role]} />
            <RequestNote request={refreshRequest} sendingText="Refreshing…" />
          </div>
        )}
    </>
  );
}

/** A watched session offers neither the menu nor answers: it was not started here, and its questions are answered in its own app. */
export function SessionCard({
  role, trackerId, session, isReadOnly = false
}: SessionCardProperties) {
  const sessionName = OrchestratorSessionUtil.nameOf(session, role);
  const refreshRequest = useSessionRequest();
  const stopRequest = useSessionRequest();
  const isDashboardOwned = session.ownership === 'dashboard';
  return (
    <section className="ap-session" aria-label={sessionName}>
      <header className="ap-session-head">
        {isDashboardOwned && session.state !== 'ended'
          ? <OrchestratorMenu role={role} trackerId={trackerId} session={session} refreshRequest={refreshRequest} stopRequest={stopRequest} />
          : null}
        <span className="ap-session-name ellipsis" title={sessionName}>{sessionName}</span>
        <SessionStateBadge role={role} session={session} />
      </header>
      <div className="ap-session-meta">
        <ContextMeter context={session.context} />
        {session.startedAt === null
          ? null
          : <span className="mono muted ap-session-started" title={session.startedAt}>started {TimeUtil.clockOfInstant(Date.parse(session.startedAt))}</span>}
      </div>
      {isDashboardOwned
        ? <DashboardSessionDetails role={role} trackerId={trackerId} session={session} refreshRequest={refreshRequest} stopRequest={stopRequest} />
        : null}
      {isReadOnly && !isDashboardOwned ? <p className="muted ap-caption">This desktop app session&apos;s conversation is in its own app.</p> : null}
      {isReadOnly
        ? null
        : <ChatBox role={role} trackerId={trackerId} sessionId={session.sessionId} sessionName={sessionName} hasEnded={session.state === 'ended'} />}
    </section>
  );
}
