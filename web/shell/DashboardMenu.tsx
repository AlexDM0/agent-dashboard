import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { InboxUtil }            from '../inbox/InboxUtil.ts';
import { requestServerRestart } from './ServerRestartRequest.ts';

type DashboardMenuStep = { kind: 'choosing' } | { kind: 'confirming-restart' } | { kind: 'sending-restart' } | { kind: 'restart-refused'; reason: string };

const CHOOSING: DashboardMenuStep = { kind: 'choosing' };

/** The header's menu beside the title: one action, a confirmed restart of the dashboard server. */
export function DashboardMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<DashboardMenuStep>(CHOOSING);
  const menuReference = useRef<HTMLDivElement | null>(null);
  const toggleReference = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const close = (): void => {
    setIsOpen(false);
    setStep(CHOOSING);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    // Captured on the window, so the board's own Esc (back to the overview) never sees the key that closes the menu.
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close();
      toggleReference.current?.focus();
    };
    const closeOnLeave = (): void => close();
    const closeOnPressOutside = (event: PointerEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (InboxUtil.isPressOutside(menuReference.current, target)) close();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('blur', closeOnLeave);
    document.addEventListener('pointerdown', closeOnPressOutside, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('blur', closeOnLeave);
      document.removeEventListener('pointerdown', closeOnPressOutside, true);
    };
  }, [isOpen]);

  const restart = async (): Promise<void> => {
    setStep({ kind: 'sending-restart' });
    const verdict = await requestServerRestart();
    if (verdict.kind === 'restarting') close();
    else setStep({ kind: 'restart-refused', reason: verdict.reason });
  };

  return (
    <div ref={menuReference} className="ap-menu">
      <button
        ref={toggleReference}
        type="button"
        className="ap-control ap-menu-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label="Dashboard menu"
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {isOpen
        ? (
          <section id={panelId} className="ap-menu-panel" aria-label="Dashboard menu">
            {step.kind === 'choosing'
              ? <button type="button" className="ap-menu-item" onClick={() => setStep({ kind: 'confirming-restart' })}>Restart server</button>
              : (
                <div className="ap-menu-confirm">
                  <p className="ap-menu-question">Restart the dashboard server?</p>
                  {step.kind === 'restart-refused' ? <p className="ap-menu-refusal" role="alert">{step.reason}</p> : null}
                  <div className="ap-menu-actions">
                    <button type="button" className="ap-control" disabled={step.kind === 'sending-restart'} onClick={() => void restart()}>Restart</button>
                    <button type="button" className="ap-control is-quiet" onClick={() => setStep(CHOOSING)}>Cancel</button>
                  </div>
                </div>
              )}
          </section>
        )
        : null}
    </div>
  );
}
