import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import type { DashboardSnapshot }           from '../../src/shared/DashboardContract.ts';
import { CrewDrawer, type CrewDrawerFocus } from '../orchestrator/CrewDrawer.tsx';
import { CrewStrip }                        from '../orchestrator/CrewStrip.tsx';
import { OrchestratorSessionUtil }          from '../orchestrator/OrchestratorSessionUtil.ts';
import { ConnectingPanel }                  from '../shell/ConnectingPanel.tsx';
import { boardHashOf, OVERVIEW_HASH }       from '../shell/HashRoute.ts';
import { BoardToolbar }                     from './BoardToolbar.tsx';
import { NoPagePanel }                      from './NoPagePanel.tsx';
import { PageFrame }                        from './PageFrame.tsx';
import { ProjectRail }                      from './ProjectRail.tsx';
import { RootPathUtil }                     from './RootPathUtil.ts';
import { UnknownProjectPanel }              from './UnknownProjectPanel.tsx';

interface BoardViewProperties {
  snapshot:        DashboardSnapshot | null;
  trackerId:       string;
  opensCrewDrawer: boolean;
}

export function BoardView({ snapshot, trackerId, opensCrewDrawer }: BoardViewProperties) {
  const frameReference = useRef<HTMLIFrameElement | null>(null);
  const crewStripReference = useRef<HTMLButtonElement | null>(null);
  const drawerId = useId();
  const [drawerFocus, setDrawerFocus] = useState<CrewDrawerFocus | null>(null);

  useEffect(() => {
    const backOnEscape = (event: KeyboardEvent): void => {
      // Esc in a chat box or an answer field keeps what is typed there rather than leaving the board.
      const isTypingField = (event.target instanceof HTMLInputElement && event.target.type === 'text') || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Escape' && !isTypingField) {
        window.location.hash = OVERVIEW_HASH;
      }
    };
    window.addEventListener('keydown', backOnEscape);
    return () => window.removeEventListener('keydown', backOnEscape);
  }, []);

  // Another project's board opens with the drawer closed, unless its hash asked for it.
  useEffect(() => setDrawerFocus(null), [trackerId]);
  useEffect(() => {
    if (!opensCrewDrawer) return;
    setDrawerFocus('chat');
    // Dropping the request from the hash lets the same link open the drawer again after it was closed.
    window.location.replace(boardHashOf(trackerId));
  }, [trackerId, opensCrewDrawer]);

  const closeDrawer = useCallback(() => {
    setDrawerFocus(null);
    crewStripReference.current?.focus();
  }, []);

  const reloadPage = useCallback(() => {
    // A board on another origin cannot be told to reload, but its frame may be sent to its page again.
    const frame = frameReference.current;
    frame?.contentWindow?.location.replace(frame.src);
  }, []);

  if (snapshot === null) {
    return <ConnectingPanel />;
  }
  const project = snapshot.projects.find((candidate) => candidate.trackerId === trackerId);
  const watchedSessions = OrchestratorSessionUtil.watchedSessionsOf(snapshot.watchedOrchestratorsByTracker, trackerId);
  return (
    <div className="ap-board">
      <ProjectRail projects={snapshot.projects} watchedOrchestratorsByTracker={snapshot.watchedOrchestratorsByTracker} selectedTrackerId={trackerId} />
      <main className="ap-board-main">
        {project === undefined
          ? <UnknownProjectPanel trackerId={trackerId} />
          : (
            <>
              <BoardToolbar project={project} homeDirectory={RootPathUtil.homeDirectoryOf(snapshot.registryPath)} onReload={reloadPage} />
              <CrewStrip
                project={project}
                watchedSessions={watchedSessions}
                isDrawerOpen={drawerFocus !== null}
                drawerId={drawerId}
                stripReference={crewStripReference}
                onOpenDrawer={setDrawerFocus}
              />
              {project.pageAvailable
                ? (
                  <PageFrame
                    key={project.trackerId}
                    pageUrl={project.pageUrl}
                    boardOrigin={snapshot.boardOrigin}
                    bridgeUrl={snapshot.boardBridgeUrl}
                    projectName={project.project}
                    frameReference={frameReference}
                  />
                )
                : <NoPagePanel root={project.root} />}
              {drawerFocus === null
                ? null
                : <CrewDrawer drawerId={drawerId} project={project} watchedSessions={watchedSessions} initialFocus={drawerFocus} onClose={closeDrawer} />}
            </>
          )}
      </main>
    </div>
  );
}
