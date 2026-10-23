import type { ContextUsage } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }  from './ContextUsageUtil.ts';

export const HANDOFF_CONFIRMATION_TEXT = 'Refresh asks for a note, stops this session, starts a fresh one with the note.';

export type OrchestratorMenuActionId = 'refresh' | 'stop';

export interface OrchestratorMenuEntry {
  id:            OrchestratorMenuActionId;
  label:         string;
  description:   string;
  question:      string;
  confirmLabel:  string;
  isHighlighted: boolean;
}

/** The drawer's orchestrator menu: Refresh orchestrator and Stop, the refresh called for once the context is critical. */
export const OrchestratorMenuUtil = Object.freeze({
  hasWarningOf(context: ContextUsage | null): boolean {
    return ContextUsageUtil.suggestsHandoff(context);
  },

  entriesOf(context: ContextUsage | null): OrchestratorMenuEntry[] {
    return [
      {
        id:            'refresh',
        label:         'Refresh orchestrator',
        description:   'Asks this orchestrator for a note on its work, stops it and starts a fresh session on the same board that carries the note.',
        question:      `Refresh this orchestrator? ${HANDOFF_CONFIRMATION_TEXT}`,
        confirmLabel:  'Refresh',
        isHighlighted: ContextUsageUtil.suggestsHandoff(context),
      },
      {
        id:            'stop',
        label:         'Stop',
        description:   'Ends this orchestrator session without a successor, leaving its board and tickets as they are until an orchestrator is started again.',
        question:      'Stop this orchestrator?',
        confirmLabel:  'Stop',
        isHighlighted: false,
      },
    ];
  },
});
