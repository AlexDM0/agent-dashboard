import {
  type RefObject,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { flushSync }                                                                       from 'react-dom';
import { BOARD_FRAME_NAME }                                                                from '../bridge/BoardBridgeMessageUtil.ts';
import { BOARD_BRIDGE_ORIGIN_ATTRIBUTE, applyThemeToEmbeddedBoards, bridgeMessageOfEvent } from '../preferences/EmbeddedBoardTheme.ts';
import { PreferenceStore }                                                                 from '../preferences/PreferenceStore.ts';
import { THEME_STORAGE_KEY, ThemeChoiceUtil }                                              from '../preferences/ThemeChoiceUtil.ts';
import { OVERVIEW_HASH }                                                                   from '../shell/HashRoute.ts';
import { followBoardFrameLoads }                                                           from './BoardFrameLoad.ts';
import { embeddedBoardUrlOf }                                                              from './EmbeddedBoardUrl.ts';

interface PageFrameProperties {
  pageUrl:        string;
  boardOrigin:    string;
  bridgeUrl:      string;
  projectName:    string;
  frameReference: RefObject<HTMLIFrameElement | null>;
}

// Scripts for the board's own rendering and polling, its origin for its storage and the bridge; no top navigation, popups or forms.
const BOARD_FRAME_SANDBOX_TOKENS = 'allow-scripts allow-same-origin';

function leaveTheBoard(): void {
  window.location.hash = OVERVIEW_HASH;
}

function sendTheStoredTheme(): void {
  applyThemeToEmbeddedBoards(ThemeChoiceUtil.choiceOf(PreferenceStore.readText(THEME_STORAGE_KEY)));
}

/**
 * The board on its own origin, beside a hidden bridge frame on that origin: the bridge reaches the board's document and
 * storage, and tells this page when the board's toggle chose a theme, Esc left it, or it is reloading.
 */
export function PageFrame({
  pageUrl, boardOrigin, bridgeUrl, projectName, frameReference
}: PageFrameProperties) {
  // The board's template carries a placeholder project name until its script runs, so the frame stays hidden until load.
  const [isBoardLoaded, setIsBoardLoaded] = useState(false);
  const bridgeReference = useRef<HTMLIFrameElement | null>(null);

  useLayoutEffect(() => {
    const frame = frameReference.current;
    const bridge = bridgeReference.current;
    if (frame === null || bridge === null) {
      return undefined;
    }
    const showLoadedBoard = (): void => {
      setIsBoardLoaded(true);
      sendTheStoredTheme();
    };
    const followBridgeMessage = (event: MessageEvent): void => {
      const message = bridgeMessageOfEvent(event);
      if (message?.kind === 'leave-board') leaveTheBoard();
      // Committed synchronously, so the next document's first paint already lands in a hidden frame.
      if (message?.kind === 'board-unloading') flushSync(() => setIsBoardLoaded(false));
    };
    const stopFollowingLoads = followBoardFrameLoads(frame, showLoadedBoard);
    bridge.addEventListener('load', sendTheStoredTheme);
    window.addEventListener('message', followBridgeMessage);
    return () => {
      stopFollowingLoads();
      bridge.removeEventListener('load', sendTheStoredTheme);
      window.removeEventListener('message', followBridgeMessage);
    };
  }, [frameReference]);

  return (
    <section className="ap-frame" aria-label={`Embedded progress.html of ${projectName}`}>
      <iframe
        ref={frameReference}
        name={BOARD_FRAME_NAME}
        className={isBoardLoaded ? 'ap-page-frame' : 'ap-page-frame is-loading'}
        src={embeddedBoardUrlOf(pageUrl)}
        sandbox={BOARD_FRAME_SANDBOX_TOKENS}
        title={`Board of ${projectName}`}
      />
      <iframe
        ref={bridgeReference}
        src={bridgeUrl}
        title={`Theme and Esc bridge for the board of ${projectName}`}
        hidden
        {...{ [BOARD_BRIDGE_ORIGIN_ATTRIBUTE]: boardOrigin }}
      />
    </section>
  );
}
