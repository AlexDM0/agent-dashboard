import { useCallback, useEffect, useRef } from 'react';
import type { DashboardSnapshot }         from '../../src/shared/DashboardContract.ts';
import { ConnectingPanel }                from '../shell/ConnectingPanel.tsx';
import { OVERVIEW_HASH }                  from '../shell/HashRoute.ts';
import { BoardToolbar }                   from './BoardToolbar.tsx';
import { NoPagePanel }                    from './NoPagePanel.tsx';
import { PageFrame }                      from './PageFrame.tsx';
import { ProjectRail }                    from './ProjectRail.tsx';
import { UnknownProjectPanel }            from './UnknownProjectPanel.tsx';

interface BoardViewProperties {
  snapshot:  DashboardSnapshot | null;
  trackerId: string;
}

export function BoardView({ snapshot, trackerId }: BoardViewProperties) {
  const frameReference = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const backOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        window.location.hash = OVERVIEW_HASH;
      }
    };
    window.addEventListener('keydown', backOnEscape);
    return () => window.removeEventListener('keydown', backOnEscape);
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
  return (
    <div className="ap-board">
      <ProjectRail projects={snapshot.projects} selectedTrackerId={trackerId} />
      <main className="ap-board-main">
        {project === undefined
          ? <UnknownProjectPanel trackerId={trackerId} />
          : (
            <>
              <BoardToolbar project={project} onReload={reloadPage} />
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
            </>
          )}
      </main>
    </div>
  );
}
