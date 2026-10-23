import { useId, useState }                                     from 'react';
import type { ProjectSnapshot }                                from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                             from '../orchestrator/OrchestratorSessionUtil.ts';
import { useSessionRequest }                                   from '../orchestrator/UseSessionRequest.ts';
import { type ChatConversation, ChatConversationListUtil }     from './ChatConversationListUtil.ts';
import { startSparringProductOwner, startWaitingOrchestrator } from './ChatOverlayRequests.ts';

interface NewConversationControlsProperties {
  projects:      ProjectSnapshot[];
  conversations: ChatConversation[];
  onSelect:      (key: string) => void;
}

/** A project picker, "New spar" (a product owner in `spar` mode) and "Talk to orchestrator" (its live one, else a fresh one). */
export function NewConversationControls({ projects, conversations, onSelect }: NewConversationControlsProperties) {
  const [chosenTrackerId, setChosenTrackerId] = useState<string | null>(null);
  const { isSending, refusal, send } = useSessionRequest();
  const pickerId = useId();
  const project = projects.find((candidate) => candidate.trackerId === chosenTrackerId) ?? projects[0];

  if (project === undefined) return <p className="muted ap-caption">No tracked project to talk to</p>;
  const { trackerId } = project;

  async function startSpar(): Promise<void> {
    const wasStarted = await send(() => startSparringProductOwner(trackerId));
    if (wasStarted) onSelect(ChatConversationListUtil.dashboardKeyOf('product-owner', trackerId));
  }

  async function talkToOrchestrator(chosenProject: ProjectSnapshot): Promise<void> {
    const orchestratorKey = ChatConversationListUtil.dashboardKeyOf('orchestrator', trackerId);
    const liveOrchestrator = conversations.find((conversation) => conversation.trackerId === trackerId
      && conversation.role === 'orchestrator' && conversation.session.state !== 'ended');
    if (liveOrchestrator !== undefined) {
      onSelect(liveOrchestrator.key);
      return;
    }
    const wasStarted = OrchestratorSessionUtil.canStart(chosenProject) ? await send(() => startWaitingOrchestrator(trackerId)) : true;
    if (wasStarted) onSelect(orchestratorKey);
  }

  return (
    <div className="ap-chat-new">
      <label className="ap-chat-new-project" htmlFor={pickerId}>
        <span className="muted ap-caption">Project</span>
        <select id={pickerId} className="ap-chat-select" value={trackerId} onChange={(event) => setChosenTrackerId(event.target.value)}>
          {projects.map((candidate) => <option key={candidate.trackerId} value={candidate.trackerId}>{candidate.project}</option>)}
        </select>
      </label>
      <div className="ap-chat-new-actions">
        <button type="button" className="ap-control" disabled={isSending} onClick={() => void startSpar()}>New spar</button>
        <button type="button" className="ap-control" disabled={isSending} onClick={() => void talkToOrchestrator(project)}>Talk to orchestrator</button>
      </div>
      {isSending ? <span className="muted ap-caption" role="status">Starting…</span> : null}
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </div>
  );
}
