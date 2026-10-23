import { type ChatConversation, ChatConversationListUtil } from '../chat/ChatConversationListUtil.ts';
import type { ChatOverlay }                                from '../chat/UseChatOverlay.ts';
import { type WaitingItem, WaitingForYouUtil }             from '../chat/WaitingForYouUtil.ts';
import { NotificationToggle }                              from '../notifications/NotificationToggle.tsx';
import type { DesktopNotifications }                       from '../notifications/UseDesktopNotifications.ts';
import type { ThemePreference }                            from '../preferences/UseThemePreference.ts';
import { DashboardMenu }                                   from './DashboardMenu.tsx';
import { type HashRoute, OVERVIEW_HASH }                   from './HashRoute.ts';
import { HeaderStatistics }                                from './HeaderStatistics.tsx';
import type { HeaderTotals }                               from './HeaderTotals.ts';
import { LiveStatus }                                      from './LiveStatus.tsx';
import { ThemeToggle }                                     from './ThemeToggle.tsx';
import type { DashboardStream }                            from './UseDashboardStream.ts';
import { ViewSwitch }                                      from './ViewSwitch.tsx';

interface HeaderProperties {
  stream:            DashboardStream;
  route:             HashRoute;
  totals:            HeaderTotals;
  orchestratorCount: number;
  waitingItems:      WaitingItem[];
  notifications:     DesktopNotifications;
  theme:             ThemePreference;
  chatOverlay:       ChatOverlay;
  conversations:     ChatConversation[];
  now:               number;
}

export function Header({
  stream, route, totals, orchestratorCount, waitingItems, notifications, theme, chatOverlay, conversations, now
}: HeaderProperties) {
  const liveCount = ChatConversationListUtil.liveCountOf(conversations);
  const waitingCount = waitingItems.length;
  const chatButtonLabel = `Chat, ${String(waitingCount)} waiting for you, ${String(liveCount)} ${liveCount === 1 ? 'agent' : 'agents'} live`;
  const openChat = (): void => {
    const opening = WaitingForYouUtil.openingOf(waitingItems, conversations, chatOverlay.selectedKey);
    chatOverlay.open(opening.key, opening.docked);
  };
  return (
    <header className="ap-header">
      <DashboardMenu />
      <div className="ap-header-identity">
        <h1 className="ap-header-name"><a href={OVERVIEW_HASH}>agent-dashboard</a></h1>
        <LiveStatus connection={stream.connection} lastUpdateAt={stream.lastUpdateAt} now={now} />
      </div>
      <ViewSwitch route={route} projectCount={totals.projectCount} />
      <HeaderStatistics totals={totals} machineParallelAgentLimit={stream.snapshot?.machineParallelAgentLimit ?? null} orchestratorCount={orchestratorCount} />
      <div className="ap-header-tools">
        <NotificationToggle notifications={notifications} />
        <button
          ref={chatOverlay.chatButtonReference}
          type="button"
          className="ap-control ap-chat-toggle"
          aria-haspopup="dialog"
          aria-expanded={chatOverlay.visibility === 'open'}
          aria-keyshortcuts="C"
          title="Chat (C)"
          aria-label={chatButtonLabel}
          onClick={openChat}
        >
          Chat
          <span className="mono muted ap-chat-toggle-count" aria-hidden="true">{liveCount}</span>
          {waitingCount === 0 ? null : <span className="ap-chat-question-badge" aria-hidden="true">{waitingCount}</span>}
        </button>
        <ThemeToggle choice={theme.choice} resolvedTheme={theme.resolvedTheme} onChoose={theme.chooseTheme} />
      </div>
    </header>
  );
}
