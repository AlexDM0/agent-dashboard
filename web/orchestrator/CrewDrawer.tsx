import {
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import type { OrchestratorSession, ProjectSnapshot, SessionRole } from '../../src/shared/DashboardContract.ts';
import { EndedFold }                                              from './EndedFold.tsx';
import { EndedSessionLine }                                       from './EndedSessionLine.tsx';
import { EndedSessionSplitUtil }                                  from './EndedSessionSplitUtil.ts';
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
  /** Opens the chat window on the tab's session; absent, the drawer offers no expand. */
  onExpand?:       (role: SessionRole) => void;
}

function isTypingField(target: EventTarget | null): boolean {
  return (target instanceof HTMLInputElement && target.type === 'text') || target instanceof HTMLTextAreaElement;
}

function sessionItself(session: OrchestratorSession): OrchestratorSession {
  return session;
}

/** The running sessions as cards, the ended ones in the closed fold under them. */
function SessionList({
  role, project, sessions, emptyCaption
}: { role: SessionRole; project: ProjectSnapshot; sessions: OrchestratorSession[]; emptyCaption: string }) {
  const { running, ended } = EndedSessionSplitUtil.splitOf(sessions, sessionItself);
  return (
    <>
      {sessions.length === 0 ? <p className="muted ap-caption">{emptyCaption}</p> : null}
      {running.map((session) => <SessionCard key={`${project.trackerId}:${session.sessionId}`} role={role} trackerId={project.trackerId} session={session} />)}
      <EndedFold endedCount={ended.length}>
        {ended.map((session) => <EndedSessionLine key={`${project.trackerId}:${session.sessionId}`} role={role} trackerId={project.trackerId} session={session} />)}
      </EndedFold>
    </>
  );
}

function OrchestratorPanel({ project, watchedSessions }: { project: ProjectSnapshot; watchedSessions: OrchestratorSession[] }) {
  return (
    <>
      {OrchestratorSessionUtil.canStart(project) ? <StartOrchestratorButton key={project.trackerId} project={project} /> : null}
      <SessionList
        role="orchestrator"
        project={project}
        sessions={OrchestratorSessionUtil.sessionsOf(project, watchedSessions)}
        emptyCaption="No orchestrator runs in this project"
      />
    </>
  );
}

/** The snapshot holds the newest product owner only, live or ended, so the tab shows that one. */
function ProductOwnerPanel({ project }: { project: ProjectSnapshot }) {
  return (
    <>
      {OrchestratorSessionUtil.canStart(project, 'product-owner')
        ? <StartProductOwnerButton key={project.trackerId} project={project} label="+ New ticket" onOpened={() => undefined} />
        : null}
      <SessionList
        role="product-owner"
        project={project}
        sessions={project.productOwner === null ? [] : [project.productOwner]}
        emptyCaption="No product owner runs in this project"
      />
    </>
  );
}

/** The crew's sessions over the board from the right, closed by its ×, the scrim and Esc, which it takes before the board's own Esc can. */
export function CrewDrawer({
  drawerId, project, watchedSessions, initialFocus, initialTab, onClose, onExpand
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

  const hasTabSession = activeTab === 'orchestrator'
    ? OrchestratorSessionUtil.sessionsOf(project, watchedSessions).length > 0
    : project.productOwner !== null;
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
          {hasTabSession && onExpand !== undefined
            ? <button type="button" className="ap-control is-quiet ap-crew-drawer-expand" onClick={() => onExpand(activeTab)}>Expand into the chat window</button>
            : null}
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
