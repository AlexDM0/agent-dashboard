import { useEffect, useRef, useState }              from 'react';
import type { DashboardSnapshot }                   from '../../src/shared/DashboardContract.ts';
import { boardHashOf, crewDrawerHashOf }            from '../shell/HashRoute.ts';
import { ChatConversationListUtil }                 from './ChatConversationListUtil.ts';
import { type ChatListFilter, ChatWindowGroupUtil } from './ChatWindowGroupUtil.ts';
import { ConversationList }                         from './ConversationList.tsx';
import { SelectedConversation }                     from './SelectedConversation.tsx';
import type { ChatOverlay }                         from './UseChatOverlay.ts';

interface ChatOverlayDialogProperties {
  snapshot: DashboardSnapshot | null;
  overlay:  ChatOverlay;
  now:      number;
}

/** Every live agent across projects over any view; it holds no conversation of its own, only which one is shown. */
export function ChatOverlayDialog({ snapshot, overlay, now }: ChatOverlayDialogProperties) {
  const dialogReference = useRef<HTMLElement | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ChatListFilter>('all');
  const isOpen = overlay.visibility === 'open';

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogReference.current;
    (dialog?.querySelector<HTMLElement>('.ap-chat-composer .ap-chat-input:not(:disabled)') ?? dialog?.querySelector<HTMLElement>('.ap-chat-close'))?.focus();
  }, [isOpen, overlay.selectedKey, overlay.composerSeed]);

  if (!isOpen) return null;
  const projects = snapshot?.projects ?? [];
  const conversations = ChatConversationListUtil.conversationsOf(projects, snapshot?.watchedOrchestratorsByTracker ?? {});
  const groups = ChatWindowGroupUtil.filteredOf(ChatWindowGroupUtil.groupsOf(projects, conversations), searchText, filter);
  // An ended conversation is shown only when picked from the fold, never by default.
  const selected = conversations.find((conversation) => conversation.key === overlay.selectedKey)
    ?? conversations.find((conversation) => ChatConversationListUtil.isLive(conversation))
    ?? null;
  const selectedProject = selected === null ? undefined : projects.find((project) => project.trackerId === selected.trackerId);
  const board = selectedProject?.health.kind === 'ready' ? selectedProject.health.board : null;
  const seed = overlay.composerSeed !== null && overlay.composerSeed.key === selected?.key ? overlay.composerSeed : null;

  const leaveFor = (hash: string): void => {
    overlay.close();
    window.location.hash = hash;
  };

  return (
    <>
      <div className="ap-chat-scrim" aria-hidden="true" onClick={overlay.close} />
      <section ref={dialogReference} className="ap-chat-overlay" role="dialog" aria-modal="true" aria-label="Chat">
        <ConversationList
          groups={groups}
          searchText={searchText}
          filter={filter}
          selectedKey={selected?.key ?? null}
          now={now}
          onSearchChange={setSearchText}
          onFilterChange={setFilter}
          onSelect={overlay.select}
          onMention={(orchestratorKey, ticketId) => overlay.selectWithComposerText(orchestratorKey, `#${ticketId} `)}
        />
        {selected === null
          ? (
            <div className="ap-chat-column ap-chat-conversation-column">
              <div className="ap-chat-conversation-actions">
                <button type="button" className="ap-control is-quiet ap-icon-control ap-chat-close" aria-label="Close the chat" onClick={overlay.close}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              <p className="muted ap-caption">No orchestrator or product owner runs yet. Start one from a project&apos;s board, or a product owner from the list.</p>
            </div>
          )
          : (
            <SelectedConversation
              conversation={selected}
              board={board}
              now={now}
              composerSeedText={seed?.text ?? ''}
              composerSeedSerial={seed?.serial ?? 0}
              onCollapse={() => leaveFor(crewDrawerHashOf(selected.trackerId, selected.role))}
              onOpenBoard={() => leaveFor(boardHashOf(selected.trackerId))}
              onClose={overlay.close}
            />
          )}
      </section>
    </>
  );
}
