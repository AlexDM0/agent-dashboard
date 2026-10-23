import { OrchestratorRequestButton } from './OrchestratorRequestButton.tsx';

interface StartBuildingButtonProperties {
  trackerId:   string;
  projectName: string;
  isPrimary?:  boolean;
}

export function StartBuildingButton({ trackerId, projectName, isPrimary = false }: StartBuildingButtonProperties) {
  return (
    <OrchestratorRequestButton
      trackerId={trackerId}
      label="Start building"
      accessibleLabel={`Ask the orchestrator of ${projectName} to start building`}
      isPrimary={isPrimary}
      orchestratorRequestOf={() => ({ kind: 'start-building' })}
    />
  );
}
