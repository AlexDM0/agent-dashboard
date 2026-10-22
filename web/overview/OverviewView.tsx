import type { DashboardSnapshot }              from '../../src/shared/DashboardContract.ts';
import { ConnectingPanel }                     from '../shell/ConnectingPanel.tsx';
import { EmptyRegistryPanel }                  from './EmptyRegistryPanel.tsx';
import { FilterBar }                           from './FilterBar.tsx';
import { NoMatchPanel }                        from './NoMatchPanel.tsx';
import { ProjectGroup }                        from './ProjectGroup.tsx';
import { type ProjectFilter, ProjectOrdering } from './ProjectOrdering.ts';
import { RegistryUnreadablePanel }             from './RegistryUnreadablePanel.tsx';

interface OverviewViewProperties {
  snapshot:       DashboardSnapshot | null;
  searchText:     string;
  filter:         ProjectFilter;
  now:            number;
  staleSince:     number | null;
  onSearchChange: (searchText: string) => void;
  onFilterChange: (filter: ProjectFilter) => void;
}

export function OverviewView({
  snapshot, searchText, filter, now, staleSince, onSearchChange, onFilterChange
}: OverviewViewProperties) {
  if (snapshot === null) {
    return <ConnectingPanel />;
  }
  if (snapshot.registry.kind === 'unreadable') {
    return <RegistryUnreadablePanel registryPath={snapshot.registryPath} reason={snapshot.registry.reason} />;
  }
  if (snapshot.projects.length === 0) {
    return <EmptyRegistryPanel registryPath={snapshot.registryPath} />;
  }
  const groups = ProjectOrdering.grouped(snapshot.projects, filter, searchText);
  return (
    <>
      <FilterBar
        searchText={searchText}
        filter={filter}
        shownCount={groups.shownCount}
        totalCount={snapshot.projects.length}
        onSearchChange={onSearchChange}
        onFilterChange={onFilterChange}
      />
      <ProjectGroup title="Active" projects={groups.active} watchedOrchestratorsByTracker={snapshot.watchedOrchestratorsByTracker} now={now} staleSince={staleSince} />
      <ProjectGroup
        title="Idle"
        projects={groups.idle}
        watchedOrchestratorsByTracker={snapshot.watchedOrchestratorsByTracker}
        now={now}
        staleSince={staleSince}
        collapsesOnPhone
      />
      {groups.shownCount === 0 ? <NoMatchPanel searchText={searchText} /> : null}
    </>
  );
}
