interface NoPagePanelProperties {
  root: string;
}

export function NoPagePanel({ root }: NoPagePanelProperties) {
  return (
    <section className="ap-frame ap-centre">
      <div className="ap-panel">
        <svg
          width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true" className="muted"
        >
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
          <path d="M14 3v5h5" />
        </svg>
        <h2 className="ap-panel-title">No progress.html yet</h2>
        <p className="ap-panel-text"><span className="ap-code-chip">agent-progress render</span> writes it.</p>
        <span className="mono muted ap-panel-path">{root}/.agent-progress/progress.html</span>
        <p className="muted ap-panel-hint">The frame loads it as soon as it appears.</p>
      </div>
    </section>
  );
}
