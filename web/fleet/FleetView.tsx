import { useCallback, useId, useState }        from 'react';
import type { DashboardSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import type { InboxEntry }                     from '../inbox/InboxUtil.ts';
import { CrewDrawer, type CrewDrawerFocus }    from '../orchestrator/CrewDrawer.tsx';
import { OrchestratorSessionUtil }             from '../orchestrator/OrchestratorSessionUtil.ts';
import { EmptyRegistryPanel }                  from '../overview/EmptyRegistryPanel.tsx';
import { RegistryUnreadablePanel }             from '../overview/RegistryUnreadablePanel.tsx';
import { ConnectingPanel }                     from '../shell/ConnectingPanel.tsx';
import { FleetRow }                            from './FleetRow.tsx';
import { type FleetFilter, FleetUtil }         from './FleetUtil.ts';
import { NeedsYouColumn }                      from './NeedsYouColumn.tsx';

interface FleetViewProperties {
  snapshot:     DashboardSnapshot | null;
  inboxEntries: InboxEntry[];
  now:          number;
}

interface OpenDrawer {
  trackerId: string;
  focus:     CrewDrawerFocus;
  tab?:      SessionRole;
}

const FILTERS: { filter: FleetFilter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'running', label: 'Running' },
  { filter: 'needs-you', label: 'Needs you' },
];

const COLUMN_HEADINGS = ['Project', 'Crew', 'Agents', 'Queue', 'Run'];

/** Every project's crew and capacity in one table, with what waits for the user beside it. */
export function FleetView({ snapshot, inboxEntries, now }: FleetViewProperties) {
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [openDrawer, setOpenDrawer] = useState<OpenDrawer | null>(null);
  const drawerId = useId();
  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  if (snapshot === null) {
    return <ConnectingPanel />;
  }
  if (snapshot.registry.kind === 'unreadable') {
    return <RegistryUnreadablePanel registryPath={snapshot.registryPath} reason={snapshot.registry.reason} />;
  }
  if (snapshot.projects.length === 0) {
    return <EmptyRegistryPanel registryPath={snapshot.registryPath} />;
  }
  const rows = FleetUtil.rowsOf(snapshot.projects, filter);
  const drawerProject = openDrawer === null ? undefined : snapshot.projects.find((project) => project.trackerId === openDrawer.trackerId);
  return (
    <div className="ap-fleet">
      <section className="ap-fleet-main" aria-label="Fleet">
        <div className="ap-filter-bar">
          <div className="ap-seg" role="group" aria-label="Show projects">
            {FILTERS.map(({ filter: shownFilter, label }) => (
              <button key={shownFilter} type="button" aria-pressed={filter === shownFilter} onClick={() => setFilter(shownFilter)}>{label}</button>
            ))}
          </div>
          <span className="mono muted ap-filter-caption">{rows.length} of {snapshot.projects.length} projects</span>
        </div>
        <div className="ap-fleet-table" role="table" aria-label="Projects">
          <div className="ap-fleet-row ap-fleet-heading" role="row">
            {COLUMN_HEADINGS.map((heading) => <span key={heading} className="ap-fleet-cell" role="columnheader">{heading}</span>)}
          </div>
          {rows.map((project) => (
            <FleetRow
              key={project.trackerId}
              project={project}
              watchedSessions={OrchestratorSessionUtil.watchedSessionsOf(snapshot.watchedOrchestratorsByTracker, project.trackerId)}
              now={now}
              onOpenChat={() => setOpenDrawer({ trackerId: project.trackerId, focus: 'chat', tab: 'orchestrator' })}
              onOpenProductOwner={() => setOpenDrawer({ trackerId: project.trackerId, focus: 'chat', tab: 'product-owner' })}
            />
          ))}
        </div>
        {rows.length === 0 ? <p className="muted ap-caption">No project matches this filter.</p> : null}
      </section>
      <NeedsYouColumn
        cards={FleetUtil.attentionCardsOf(inboxEntries, snapshot.projects)}
        now={now}
        onOpenHandoff={(trackerId) => setOpenDrawer({ trackerId, focus: 'close', tab: 'orchestrator' })}
      />
      {openDrawer === null || drawerProject === undefined
        ? null
        : (
          <CrewDrawer
            key={drawerProject.trackerId}
            drawerId={drawerId}
            project={drawerProject}
            watchedSessions={OrchestratorSessionUtil.watchedSessionsOf(snapshot.watchedOrchestratorsByTracker, drawerProject.trackerId)}
            initialFocus={openDrawer.focus}
            {...(openDrawer.tab === undefined ? {} : { initialTab: openDrawer.tab })}
            onClose={closeDrawer}
          />
        )}
    </div>
  );
}
