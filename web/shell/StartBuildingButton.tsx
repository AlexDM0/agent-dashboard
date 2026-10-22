import { OrchestratorRequestButton } from './OrchestratorRequestButton.tsx';

interface StartBuildingButtonProperties {
  trackerId:   string;
  projectName: string;
}

export function StartBuildingButton({ trackerId, projectName }: StartBuildingButtonProperties) {
  return (
    <OrchestratorRequestButton
      trackerId={trackerId}
      label="Start building"
      accessibleLabel={`Ask the orchestrator of ${projectName} to start building`}
      orchestratorRequestOf={() => ({ kind: 'start-building' })}
    />
  );
}
