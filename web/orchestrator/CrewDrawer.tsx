import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil }                                from './OrchestratorSessionUtil.ts';
import { SessionCard }                                            from './SessionCard.tsx';
import { StartOrchestratorButton }                                from './StartOrchestratorButton.tsx';
import { StartProductOwnerButton }                                from './StartProductOwnerButton.tsx';

/** Where focus lands as the drawer opens: its close button, or the leading session's chat box. */
export type CrewDrawerFocus = 'close' | 'chat';

/** One tab per crew role. */
const CREW_TABS: { tab: SessionRole; label: string }[] = [
  { tab: 'orchestrator', label: 'Orchestrator' },
  { tab: 'product-owner', label: 'Product owner' },
];

interface CrewDrawerProperties {
  drawerId:        string;
  project:         ProjectSnapshot;
  watchedSessions: OrchestratorSession[];
  initialFocus:    CrewDrawerFocus;
  /** The tab the drawer opens on; when absent, the one whose questions alone wait, else the orchestrator's. */
  initialTab?:     SessionRole;
  onClose:         () => void;
}

function isTypingField(target: EventTarget | null): boolean {
  return (target instanceof HTMLInputElement && target.type === 'text') || target instanceof HTMLTextAreaElement;
}

function OrchestratorPanel({ project, watchedSessions }: { project: ProjectSnapshot; watchedSessions: OrchestratorSession[] }) {
  const sessions = OrchestratorSessionUtil.sessionsOf(project, watchedSessions);
  return (
    <>
      {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
      {sessions.length === 0 ? <p className="muted ap-caption">No orchestrator runs in this project</p> : null}
      {sessions.map((session) => <SessionCard key={`${project.trackerId}:${session.sessionId}`} role="orchestrator" trackerId={project.trackerId} session={session} />)}
    </>
  );
}

/** The snapshot holds the newest product owner only, live or ended, so the tab shows that one. */
function ProductOwnerPanel({ project }: { project: ProjectSnapshot }) {
  const session = project.productOwner;
  return (
    <>
      {OrchestratorSessionUtil.canStart(project, 'product-owner')
        ? <StartProductOwnerButton key={project.trackerId} project={project} label="+ New ticket" onOpened={() => undefined} />
        : null}
      {session === null
        ? <p className="muted ap-caption">No product owner runs in this project</p>
        : <SessionCard key={`${project.trackerId}:${session.sessionId}`} role="product-owner" trackerId={project.trackerId} session={session} />}
    </>
  );
}

/** The crew's sessions over the board from the right, closed by its ×, the scrim and Esc, which it takes before the board's own Esc can. */
export function CrewDrawer({
  drawerId, project, watchedSessions, initialFocus, initialTab, onClose
}: CrewDrawerProperties) {
  const drawerReference = useRef<HTMLElement | null>(null);
  const tabIdPrefix = useId();
  const [activeTab, setActiveTab] = useState<SessionRole>(() => initialTab ?? OrchestratorSessionUtil.askingRoleOf(project));

  useEffect(() => {
    if (initialTab !== undefined) setActiveTab(initialTab);
  }, [initialTab]);

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
            {CREW_TABS.map(({ tab, label }) => {
              const questionCount = OrchestratorSessionUtil.roleQuestionCountOf(project, tab);
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`${tabIdPrefix}-${tab}`}
                  className="ap-crew-tab"
                  aria-selected={tab === activeTab}
                  aria-controls={`${tabIdPrefix}-${tab}-panel`}
                  onClick={() => setActiveTab(tab)}
                >
                  {label}
                  {questionCount === 0
                    ? null
                    : <span className="ap-crew-tab-count" aria-label={`${String(questionCount)} ${questionCount === 1 ? 'question' : 'questions'} waiting`}>{questionCount}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" className="ap-control is-quiet ap-icon-control ap-crew-drawer-close" aria-label="Close the crew drawer" onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="ap-crew-drawer-body" role="tabpanel" id={`${tabIdPrefix}-${activeTab}-panel`} aria-labelledby={`${tabIdPrefix}-${activeTab}`}>
          {activeTab === 'orchestrator'
            ? <OrchestratorPanel project={project} watchedSessions={watchedSessions} />
            : <ProductOwnerPanel project={project} />}
        </div>
      </aside>
    </>
  );
}
