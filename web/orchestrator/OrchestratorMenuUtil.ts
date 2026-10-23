import type { ContextUsage } from '../../src/shared/DashboardContract.ts';
import { ContextUsageUtil }  from './ContextUsageUtil.ts';

export const HANDOFF_CONFIRMATION_TEXT = 'Refresh asks for a note, stops this session, starts a fresh one with the note.';

export type OrchestratorMenuActionId = 'refresh' | 'open-in-app' | 'stop';

function openInAppEntryOf(roleWord: string): OrchestratorMenuEntry {
  return {
    id:            'open-in-app',
    label:         'Open in Claude app',
    description:   `Stops this ${roleWord} here and opens its conversation in the Claude desktop app, where it carries on as a watched session.`,
    question:      `Open this ${roleWord} in the Claude app? The dashboard stops its own process first.`,
    confirmLabel:  'Open in app',
    isHighlighted: false,
  };
}

export interface OrchestratorMenuEntry {
  id:            OrchestratorMenuActionId;
  label:         string;
  description:   string;
  question:      string;
  confirmLabel:  string;
  isHighlighted: boolean;
}

/** The drawer's orchestrator menu: Refresh orchestrator, Open in Claude app and Stop, the refresh called for once the context is critical. */
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
      openInAppEntryOf('orchestrator'),
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

  /** A product owner hands nothing on, so its menu holds Open in Claude app and End session. */
  productOwnerEntriesOf(): OrchestratorMenuEntry[] {
    return [
      openInAppEntryOf('product owner'),
      {
        id:            'stop',
        label:         'End session',
        description:   'Ends this product owner session; the tickets it filed stay on the board.',
        question:      'End this product owner session?',
        confirmLabel:  'End session',
        isHighlighted: false,
      },
    ];
  },
});
