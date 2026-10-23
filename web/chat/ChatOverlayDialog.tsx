import { useEffect, useRef }                               from 'react';
import type { DashboardSnapshot }                          from '../../src/shared/DashboardContract.ts';
import { crewDrawerHashOf }                                from '../shell/HashRoute.ts';
import { type ChatConversation, ChatConversationListUtil } from './ChatConversationListUtil.ts';
import { ConversationList }                                from './ConversationList.tsx';
import { SelectedConversation }                            from './SelectedConversation.tsx';
import type { ChatOverlay }                                from './UseChatOverlay.ts';

interface ChatOverlayDialogProperties {
  snapshot: DashboardSnapshot | null;
  overlay:  ChatOverlay;
}

const ROLE_WORDS = { 'orchestrator': 'orchestrator', 'product-owner': 'product owner' } as const;

function DockChip({ conversation, onOpen }: { conversation: ChatConversation | null; onOpen: () => void }) {
  const chipReference = useRef<HTMLButtonElement | null>(null);
  useEffect(() => chipReference.current?.focus(), []);
  const label = conversation === null ? 'Chat' : `Chat · ${conversation.projectName} ${ROLE_WORDS[conversation.role]}`;
  return (
    <button ref={chipReference} type="button" className="ap-control ap-chat-dock-chip" aria-label={`Reopen the chat: ${label}`} onClick={onOpen}>
      {label}
    </button>
  );
}

/** Every crew conversation across projects over any view; it holds no conversation of its own, only which one is shown. */
export function ChatOverlayDialog({ snapshot, overlay }: ChatOverlayDialogProperties) {
  const dialogReference = useRef<HTMLElement | null>(null);
  const isOpen = overlay.visibility === 'open';

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogReference.current;
    (dialog?.querySelector<HTMLElement>('.ap-chat-input:not(:disabled)') ?? dialog?.querySelector<HTMLElement>('.ap-chat-close'))?.focus();
  }, [isOpen]);

  if (overlay.visibility === 'closed') return null;
  const projects = snapshot?.projects ?? [];
  const conversations = ChatConversationListUtil.conversationsOf(projects, snapshot?.watchedOrchestratorsByTracker ?? {});
  const selected = conversations.find((conversation) => conversation.key === overlay.selectedKey) ?? conversations[0] ?? null;

  if (overlay.visibility === 'minimised') return <DockChip conversation={selected} onOpen={overlay.open} />;

  const selectedProject = selected === null ? undefined : projects.find((project) => project.trackerId === selected.trackerId);
  const board = selectedProject?.health.kind === 'ready' ? selectedProject.health.board : null;
  const dock = (): void => {
    if (selected === null) return;
    overlay.close();
    window.location.hash = crewDrawerHashOf(selected.trackerId, selected.role);
  };

  return (
    <>
      <div className="ap-chat-scrim" aria-hidden="true" onClick={overlay.close} />
      <section ref={dialogReference} className="ap-chat-overlay" role="dialog" aria-modal="true" aria-label="Chat">
        <ConversationList projects={projects} conversations={conversations} selectedKey={selected?.key ?? null} onSelect={overlay.select} />
        {selected === null
          ? (
            <div className="ap-chat-column ap-chat-conversation-column">
              <div className="ap-chat-conversation-actions">
                <button type="button" className="ap-control is-quiet ap-icon-control ap-chat-close" aria-label="Close the chat" onClick={overlay.close}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <p className="muted ap-caption">Start a spar or talk to an orchestrator from the list.</p>
            </div>
          )
          : <SelectedConversation conversation={selected} board={board} onMinimise={overlay.minimise} onDock={dock} onClose={overlay.close} />}
      </section>
    </>
  );
}
