interface NoMatchPanelProperties {
  searchText: string;
}

export function NoMatchPanel({ searchText }: NoMatchPanelProperties) {
  return (
    <div className="ap-empty-panel">
      <p className="ap-empty-panel-title">No project matches</p>
      <p className="ap-empty-panel-text">
        {searchText.trim() === '' ? 'No project is active right now.' : <>Nothing in the registry matches <span className="mono">{searchText}</span> under this filter.</>}
      </p>
    </div>
  );
}
