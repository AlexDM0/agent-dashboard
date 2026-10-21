import { OVERVIEW_HASH } from '../shell/HashRoute.ts';

interface UnknownProjectPanelProperties {
  trackerId: string;
}

export function UnknownProjectPanel({ trackerId }: UnknownProjectPanelProperties) {
  return (
    <div className="ap-centre">
      <div className="ap-panel">
        <h2 className="ap-panel-title">No such project</h2>
        <p className="ap-panel-text">The registry holds no tracker with this id.</p>
        <span className="mono muted ap-panel-path">{trackerId}</span>
        <a className="ap-button" href={OVERVIEW_HASH}>Back to the overview</a>
      </div>
    </div>
  );
}
