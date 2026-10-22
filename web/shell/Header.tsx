import type { ThemePreference } from '../preferences/UseThemePreference.ts';
import { OVERVIEW_HASH }        from './HashRoute.ts';
import { HeaderStatistics }     from './HeaderStatistics.tsx';
import type { HeaderTotals }    from './HeaderTotals.ts';
import { LiveStatus }           from './LiveStatus.tsx';
import { ThemeToggle }          from './ThemeToggle.tsx';
import type { DashboardStream } from './UseDashboardStream.ts';

interface HeaderProperties {
  stream: DashboardStream;
  totals: HeaderTotals;
  theme:  ThemePreference;
  now:    number;
}

export function Header({
  stream, totals, theme, now
}: HeaderProperties) {
  return (
    <header className="ap-header">
      <div className="ap-header-identity">
        <h1 className="ap-header-name"><a href={OVERVIEW_HASH}>agent-dashboard</a></h1>
        <LiveStatus connection={stream.connection} lastUpdateAt={stream.lastUpdateAt} now={now} />
      </div>
      <HeaderStatistics totals={totals} machineParallelAgentLimit={stream.snapshot?.machineParallelAgentLimit ?? null} />
      <ThemeToggle choice={theme.choice} resolvedTheme={theme.resolvedTheme} onChoose={theme.chooseTheme} />
    </header>
  );
}
