import { useId, useRef, useState } from 'react';
import { useDismissablePopover }   from '../popover/UseDismissablePopover.ts';
import {
  type MenuActionVerdict,
  type MenuEvent,
  type MenuStep,
  MenuStepUtil
} from './MenuStepUtil.ts';

export interface PopoverMenuAction {
  id:            string;
  label:         string;
  /** One sentence on what the action does, its tooltip and its accessible description. */
  description:   string;
  question:      string;
  confirmLabel:  string;
  isHighlighted: boolean;
  run:           () => Promise<MenuActionVerdict>;
}

interface PopoverMenuProperties {
  label:      string;
  actions:    PopoverMenuAction[];
  hasWarning: boolean;
}

/** A hamburger toggle and its panel of actions, each confirmed inside the panel before it runs. */
export function PopoverMenu({ label, actions, hasWarning }: PopoverMenuProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<MenuStep>(MenuStepUtil.initialStep());
  const menuReference = useRef<HTMLDivElement | null>(null);
  const toggleReference = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = (): void => {
    setIsOpen(false);
    setStep((currentStep) => MenuStepUtil.nextStepOf(currentStep, { kind: 'closed' }));
  };

  useDismissablePopover({
    isOpen, containerReference: menuReference, toggleReference, close
  });

  const runAction = async (actionId: string): Promise<void> => {
    const action = actions.find((candidate) => candidate.id === actionId);
    if (action === undefined) return;
    const verdict = await action.run();
    setStep((currentStep) => MenuStepUtil.nextStepOf(currentStep, { kind: 'verdict-received', verdict }));
    if (verdict.kind === 'done') setIsOpen(false);
  };

  const advance = (event: MenuEvent): void => {
    const nextStep = MenuStepUtil.nextStepOf(step, event);
    setStep(nextStep);
    if (MenuStepUtil.startsSending(step, nextStep) && nextStep.kind === 'sending') void runAction(nextStep.actionId);
  };

  const chosenAction = step.kind === 'choosing' ? undefined : actions.find((action) => action.id === step.actionId);

  return (
    <div ref={menuReference} className="ap-menu">
      <button
        ref={toggleReference}
        type="button"
        className="ap-control ap-menu-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={label}
        data-warning={hasWarning}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {hasWarning ? <span className="ap-menu-warning-dot" aria-hidden="true" /> : null}
      </button>
      {isOpen
        ? (
          <section id={panelId} className="ap-menu-panel" aria-label={label}>
            {chosenAction === undefined
              ? actions.map((action) => (
                <div key={action.id} className="ap-menu-entry">
                  <button
                    type="button"
                    className="ap-menu-item"
                    data-highlighted={action.isHighlighted}
                    title={action.description}
                    aria-describedby={`${panelId}-${action.id}`}
                    onClick={() => advance({ kind: 'action-chosen', actionId: action.id })}
                  >
                    {action.label}
                  </button>
                  <span id={`${panelId}-${action.id}`} className="ap-visually-hidden">{action.description}</span>
                </div>
              ))
              : (
                <div className="ap-menu-confirm">
                  <p className="ap-menu-question">{chosenAction.question}</p>
                  {step.kind === 'refused' ? <p className="ap-menu-refusal" role="alert">{step.reason}</p> : null}
                  <div className="ap-menu-actions">
                    <button type="button" className="ap-control" disabled={step.kind === 'sending'} onClick={() => advance({ kind: 'confirmed' })}>
                      {chosenAction.confirmLabel}
                    </button>
                    <button type="button" className="ap-control is-quiet" onClick={() => (step.kind === 'sending' ? close() : advance({ kind: 'cancelled' }))}>Cancel</button>
                  </div>
                </div>
              )}
          </section>
        )
        : null}
    </div>
  );
}
