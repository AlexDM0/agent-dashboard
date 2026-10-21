import { type RefObject, useEffect }   from 'react';
import { EMBEDDED_BOARD_ATTRIBUTE }    from '../preferences/EmbeddedBoardTheme.ts';
import { OVERVIEW_HASH }               from '../shell/HashRoute.ts';
import { followEscapeInEmbeddedBoard } from './EmbeddedBoardEscape.ts';

interface PageFrameProperties {
  pageUrl:        string;
  projectName:    string;
  frameReference: RefObject<HTMLIFrameElement | null>;
}

function leaveTheBoard(): void {
  window.location.hash = OVERVIEW_HASH;
}

export function PageFrame({ pageUrl, projectName, frameReference }: PageFrameProperties) {
  // A key pressed inside the frame never reaches this window, so each page the frame loads is followed itself.
  useEffect(() => {
    const frame = frameReference.current;
    if (frame === null) {
      return undefined;
    }
    let stopFollowing = (): void => {};
    const followLoadedBoard = (): void => {
      stopFollowing();
      stopFollowing = () => {};
      try {
        const boardWindow = frame.contentWindow;
        if (boardWindow !== null) {
          stopFollowing = followEscapeInEmbeddedBoard(boardWindow, leaveTheBoard);
        }
      } catch {
        // A frame from another origin cannot be reached; Esc then works only outside it.
      }
    };
    frame.addEventListener('load', followLoadedBoard);
    return () => {
      frame.removeEventListener('load', followLoadedBoard);
      try {
        stopFollowing();
      } catch {
        // The followed page may already be gone.
      }
    };
  }, [frameReference]);

  return (
    <section className="ap-frame" aria-label={`Embedded progress.html of ${projectName}`}>
      <iframe ref={frameReference} className="ap-page-frame" src={pageUrl} title={`Board of ${projectName}`} {...{ [EMBEDDED_BOARD_ATTRIBUTE]: '' }} />
    </section>
  );
}
