export type MenuStep =
  | { kind: 'choosing' }
  | { kind: 'confirming'; actionId: string }
  | { kind: 'sending'; actionId: string }
  | { kind: 'refused'; actionId: string; reason: string };

export type MenuActionVerdict = { kind: 'done' } | { kind: 'refused'; reason: string };

export type MenuEvent =
  | { kind: 'action-chosen'; actionId: string }
  | { kind: 'cancelled' }
  | { kind: 'confirmed' }
  | { kind: 'verdict-received'; verdict: MenuActionVerdict }
  | { kind: 'closed' };

/** A menu action runs only on the step into `sending`, which only a confirm reaches; a request out survives the panel closing. */
export const MenuStepUtil = Object.freeze({
  initialStep(): MenuStep {
    return { kind: 'choosing' };
  },

  nextStepOf(step: MenuStep, event: MenuEvent): MenuStep {
    switch (event.kind) {
      case 'action-chosen':
        return step.kind === 'choosing' ? { kind: 'confirming', actionId: event.actionId } : step;
      case 'cancelled':
        return step.kind === 'confirming' || step.kind === 'refused' ? { kind: 'choosing' } : step;
      case 'confirmed':
        return step.kind === 'confirming' || step.kind === 'refused' ? { kind: 'sending', actionId: step.actionId } : step;
      case 'verdict-received':
        if (step.kind !== 'sending') return step;
        return event.verdict.kind === 'done' ? { kind: 'choosing' } : { kind: 'refused', actionId: step.actionId, reason: event.verdict.reason };
      case 'closed':
        return step.kind === 'sending' ? step : { kind: 'choosing' };
    }
  },

  startsSending(step: MenuStep, nextStep: MenuStep): boolean {
    return step.kind !== 'sending' && nextStep.kind === 'sending';
  },
});
