interface EmptyRegistryPanelProperties {
  registryPath: string;
}

export function EmptyRegistryPanel({ registryPath }: EmptyRegistryPanelProperties) {
  return (
    <div className="ap-centre">
      <div className="ap-panel">
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className="muted"
        >
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <h2 className="ap-panel-title">No projects yet</h2>
        <p className="ap-panel-text">agent-progress registers a project the first time a command renders its page.</p>
        <span className="mono muted ap-panel-path">{registryPath}</span>
        <p className="muted ap-panel-hint">Run <span className="ap-code-chip">agent-progress render</span> in a tracked repository.</p>
      </div>
    </div>
  );
}
