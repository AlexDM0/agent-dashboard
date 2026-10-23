import { FLEET_HASH, type HashRoute, OVERVIEW_HASH } from './HashRoute.ts';

interface ViewSwitchProperties {
  route:        HashRoute;
  projectCount: number;
}

/** Projects | Fleet as links, the current view marked; a board is neither view, so it marks none. */
export function ViewSwitch({ route, projectCount }: ViewSwitchProperties) {
  return (
    <nav className="ap-seg ap-view-switch" aria-label="View">
      <a href={OVERVIEW_HASH} {...(route.kind === 'overview' ? { 'aria-current': 'page' as const } : {})}>
        Projects <span className="ap-view-switch-count">{projectCount}</span>
      </a>
      <a href={FLEET_HASH} {...(route.kind === 'fleet' ? { 'aria-current': 'page' as const } : {})}>Fleet</a>
    </nav>
  );
}
