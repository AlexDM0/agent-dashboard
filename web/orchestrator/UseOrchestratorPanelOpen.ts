import { useCallback, useState } from 'react';
import { PreferenceStore }       from '../preferences/PreferenceStore.ts';

const PANEL_OPEN_STORAGE_KEY = 'agent-dashboard:orchestrator-panel';
const OPEN_VALUE = 'open';
const CLOSED_VALUE = 'closed';

/** Whether the board's orchestrator panel is open, remembered across visits; open until the user closes it. */
export function useOrchestratorPanelOpen(): { isOpen: boolean; toggle: () => void } {
  const [isOpen, setIsOpen] = useState(() => PreferenceStore.readText(PANEL_OPEN_STORAGE_KEY) !== CLOSED_VALUE);
  const toggle = useCallback(() => {
    PreferenceStore.writeText(PANEL_OPEN_STORAGE_KEY, isOpen ? CLOSED_VALUE : OPEN_VALUE);
    setIsOpen(!isOpen);
  }, [isOpen]);
  return { isOpen, toggle };
}
