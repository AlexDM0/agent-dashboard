import type { ProjectFilter } from './ProjectOrdering.ts';

interface FilterBarProperties {
  searchText:     string;
  filter:         ProjectFilter;
  shownCount:     number;
  totalCount:     number;
  onSearchChange: (searchText: string) => void;
  onFilterChange: (filter: ProjectFilter) => void;
}

export function FilterBar({
  searchText, filter, shownCount, totalCount, onSearchChange, onFilterChange
}: FilterBarProperties) {
  return (
    <div className="ap-filter-bar">
      <label className="ap-visually-hidden" htmlFor="project-search">Search projects by name or path</label>
      <div className="ap-search">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <input id="project-search" type="search" placeholder="Search projects or paths" value={searchText} onChange={(event) => onSearchChange(event.target.value)} />
      </div>
      <div className="ap-seg" role="group" aria-label="Show projects">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => onFilterChange('all')}>All</button>
        <button type="button" aria-pressed={filter === 'active'} onClick={() => onFilterChange('active')}>Active</button>
      </div>
      <span className="mono muted ap-filter-caption">{shownCount} of {totalCount} projects</span>
    </div>
  );
}
