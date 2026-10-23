import { useEffect, useId, useRef }                  from 'react';
import type { OrchestratorSession, ProjectSnapshot } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                   from './OrchestratorSessionUtil.ts';
import { SessionCard }                               from './SessionCard.tsx';
import { StartOrchestratorButton }                   from './StartOrchestratorButton.tsx';

/** Where focus lands as the drawer opens: its close button, or the leading session's chat box. */
export type CrewDrawerFocus = 'close' | 'chat';

type CrewTab = 'orchestrator';

/** One tab per crew role; the product owner's joins this list. */
const CREW_TABS: { tab: CrewTab; label: string }[] = [{ tab: 'orchestrator', label: 'Orchestrator' }];

interface CrewDrawerProperties {
  drawerId:        string;
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  initialFocus:    CrewDrawerFocus;
  onClose:         () => void;
}

function isTypingField(target: EventTarget | null): boolean {
  return (target instanceof HTMLInputElement && target.type === 'text') || target instanceof HTMLTextAreaElement;
}

/** The crew's sessions over the board from the right, closed by its ×, the scrim and Esc, which it takes before the board's own Esc can. */
export function CrewDrawer({
  drawerId, project, watchedSessions, initialFocus, onClose
}: CrewDrawerProperties) {
  const drawerReference = useRef<HTMLElement | null>(null);
  const tabIdPrefix = useId();
  const activeTab: CrewTab = 'orchestrator';
  const sessions = OrchestratorSessionUtil.sessionsOf(project, watchedSessions);

  useEffect(() => {
    const focusTarget = initialFocus === 'chat'
      ? drawerReference.current?.querySelector<HTMLElement>('.ap-chat-input:not(:disabled)')
      : null;
    (focusTarget ?? drawerReference.current?.querySelector<HTMLElement>('.ap-crew-drawer-close'))?.focus();
  }, [initialFocus]);

  useEffect(() => {
    // Captured on the document: after an open popover's window capture, which closes the menu alone, and before the
    // board's Esc (back to the overview), which never sees the key that closes the drawer.
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isTypingField(event.target)) return;
      event.stopPropagation();
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [onClose]);

  return (
    <>
      <div className="ap-crew-scrim" aria-hidden="true" onClick={onClose} />
      <aside ref={drawerReference} id={drawerId} className="ap-crew-drawer" role="dialog" aria-label={`Crew of ${project.project}`}>
        <header className="ap-crew-drawer-head">
          <div className="ap-crew-tabs" role="tablist" aria-label="Crew">
            {CREW_TABS.map(({ tab, label }) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabIdPrefix}-${tab}`}
                className="ap-crew-tab"
                aria-selected={tab === activeTab}
                aria-controls={`${tabIdPrefix}-${tab}-panel`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="ap-control is-quiet ap-icon-control ap-crew-drawer-close" aria-label="Close the crew drawer" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ap-crew-drawer-body" role="tabpanel" id={`${tabIdPrefix}-${activeTab}-panel`} aria-labelledby={`${tabIdPrefix}-${activeTab}`}>
          {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
          {sessions.length === 0 ? <p className="muted ap-caption">No orchestrator runs in this project</p> : null}
          {sessions.map((session) => <SessionCard key={`${project.trackerId}:${session.sessionId}`} trackerId={project.trackerId} session={session} />)}
        </div>
      </aside>
    </>
  );
}
