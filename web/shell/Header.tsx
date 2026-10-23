import { Inbox }                         from '../inbox/Inbox.tsx';
import type { InboxEntry }               from '../inbox/InboxUtil.ts';
import { NotificationToggle }            from '../notifications/NotificationToggle.tsx';
import type { DesktopNotifications }     from '../notifications/UseDesktopNotifications.ts';
import type { ThemePreference }          from '../preferences/UseThemePreference.ts';
import { DashboardMenu }                 from './DashboardMenu.tsx';
import { type HashRoute, OVERVIEW_HASH } from './HashRoute.ts';
import { HeaderStatistics }              from './HeaderStatistics.tsx';
import type { HeaderTotals }             from './HeaderTotals.ts';
import { LiveStatus }                    from './LiveStatus.tsx';
import { ThemeToggle }                   from './ThemeToggle.tsx';
import type { DashboardStream }          from './UseDashboardStream.ts';
import { ViewSwitch }                    from './ViewSwitch.tsx';

interface HeaderProperties {
  stream:            DashboardStream;
  route:             HashRoute;
  totals:            HeaderTotals;
  orchestratorCount: number;
  inboxEntries:      InboxEntry[];
  notifications:     DesktopNotifications;
  theme:             ThemePreference;
  now:               number;
}

export function Header({
  stream, route, totals, orchestratorCount, inboxEntries, notifications, theme, now
}: HeaderProperties) {
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
        <Inbox entries={inboxEntries} now={now} />
        <ThemeToggle choice={theme.choice} resolvedTheme={theme.resolvedTheme} onChoose={theme.chooseTheme} />
      </div>
    </header>
  );
}
