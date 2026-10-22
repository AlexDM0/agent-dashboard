import { useEffect, useState } from 'react';
import { BoardView }           from './board/BoardView.tsx';
import { InboxUtil }           from './inbox/InboxUtil.ts';
import { OverviewView }        from './overview/OverviewView.tsx';
import type { ProjectFilter }  from './overview/ProjectOrdering.ts';
import { useThemePreference }  from './preferences/UseThemePreference.ts';
import { ConnectionBanner }    from './shell/ConnectionBanner.tsx';
import { Header }              from './shell/Header.tsx';
import { headerTotalsOf }      from './shell/HeaderTotals.ts';
import { useDashboardStream }  from './shell/UseDashboardStream.ts';
import { useHashRoute }        from './shell/UseHashRoute.ts';
import { useNow }              from './shell/UseNow.ts';

const APPLICATION_NAME = 'agent-dashboard';

export function App() {
  const stream = useDashboardStream();
  const route = useHashRoute();
  const theme = useThemePreference();
  const tickingNow = useNow();
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  // A snapshot can arrive between ticks; an age is never measured against a clock older than it.
  const now = Math.max(tickingNow, stream.lastUpdateAt ?? 0);
  const projects = stream.snapshot?.projects ?? [];
  // While the stream is down the cards show their numbers as of the last snapshot.
  const staleSince = stream.connection === 'reconnecting' ? stream.lastUpdateAt : null;
  const boardProjectName = route.kind === 'board' ? projects.find((project) => project.trackerId === route.trackerId)?.project : undefined;

  const inboxEntries = InboxUtil.entriesOf(projects);
  const pendingQuestionCount = inboxEntries.length;

  useEffect(() => {
    const pageTitle = boardProjectName === undefined ? APPLICATION_NAME : `${boardProjectName} · ${APPLICATION_NAME}`;
    document.title = InboxUtil.documentTitleOf(pendingQuestionCount, pageTitle);
  }, [boardProjectName, pendingQuestionCount]);

  return (
    <div className="ap-app" data-route={route.kind}>
      <div className="ap-page">
        <Header stream={stream} totals={headerTotalsOf(projects)} inboxEntries={inboxEntries} theme={theme} now={now} />
        <ConnectionBanner connection={stream.connection} lastUpdateAt={stream.lastUpdateAt} now={now} />
        {route.kind === 'board'
          ? <BoardView snapshot={stream.snapshot} trackerId={route.trackerId} />
          : (
            <OverviewView
              snapshot={stream.snapshot}
              searchText={searchText}
              filter={filter}
              now={now}
              staleSince={staleSince}
              onSearchChange={setSearchText}
              onFilterChange={setFilter}
            />
          )}
      </div>
    </div>
  );
}
