interface RegistryUnreadablePanelProperties {
  registryPath: string;
  reason:       string;
}

export function RegistryUnreadablePanel({ registryPath, reason }: RegistryUnreadablePanelProperties) {
  return (
    <div className="ap-centre">
      <div className="ap-panel">
        <h2 className="ap-panel-title">The registry cannot be read</h2>
        <p className="ap-reason">{reason}</p>
        <span className="mono muted ap-panel-path">{registryPath}</span>
        <p className="muted ap-panel-hint">The dashboard reads it again as soon as it changes.</p>
      </div>
    </div>
  );
}
