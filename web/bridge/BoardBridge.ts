/**
 * The bridge: a hidden page on the board origin, framed by the dashboard beside the board frame. Being same-origin with
 * the board, it reaches the board's document and storage the dashboard no longer can, and relays the theme and Esc.
 */
import { followEscapeInEmbeddedBoard }                                  from '../board/EmbeddedBoardEscape.ts';
import { PreferenceStore }                                              from '../preferences/PreferenceStore.ts';
import { THEME_STORAGE_KEY, type ThemeChoice, ThemeChoiceUtil }         from '../preferences/ThemeChoiceUtil.ts';
import { BOARD_FRAME_NAME, type BridgeMessage, BoardBridgeMessageUtil } from './BoardBridgeMessageUtil.ts';

const DASHBOARD_ORIGINS_ATTRIBUTE = 'data-dashboard-origins';

/** The sibling frame holding the board once it shows a board-origin document; a frame of another origin throws on `name`. */
function boardWindowBeside(bridgeWindow: Window): Window | null {
  const siblings = bridgeWindow.parent.frames;
  for (let i = 0; i < siblings.length; i++) {
    try {
      const sibling = siblings[i];
      if (sibling !== undefined && sibling !== bridgeWindow && sibling.name === BOARD_FRAME_NAME) return sibling;
    } catch {
      // A sibling not on the board origin, or the board between documents.
    }
  }
  return null;
}

export function startBoardBridge(bridgeWindow: Window): void {
  const dashboardOrigins = new Set((bridgeWindow.document.documentElement.getAttribute(DASHBOARD_ORIGINS_ATTRIBUTE) ?? '').split(' ').filter(Boolean));
  let dashboardOrigin: string | null = null;
  let followedDocument: Document | null = null;
  let stopFollowing = (): void => {};

  function tellTheDashboard(message: BridgeMessage): void {
    if (dashboardOrigin !== null) bridgeWindow.parent.postMessage(message, dashboardOrigin);
  }

  /** Follows each board document once: a reload brings a new one, whose listeners start empty. */
  function followTheBoard(): Window | null {
    const boardWindow = boardWindowBeside(bridgeWindow);
    if (boardWindow === null || boardWindow.document === followedDocument) return boardWindow;
    try {
      stopFollowing();
    } catch {
      // The followed document may already be gone.
    }
    followedDocument = boardWindow.document;
    const announceUnloading = (): void => tellTheDashboard({ kind: 'board-unloading' });
    const stopFollowingEscape = followEscapeInEmbeddedBoard(boardWindow, () => tellTheDashboard({ kind: 'leave-board' }));
    boardWindow.addEventListener('pagehide', announceUnloading);
    stopFollowing = () => {
      stopFollowingEscape();
      boardWindow.removeEventListener('pagehide', announceUnloading);
    };
    return boardWindow;
  }

  /**
   * Stores the choice for a board still loading, then clicks the board's own theme radio, so its toggle and its document
   * follow together; the page does not listen for storage events.
   */
  function showTheme(themeChoice: ThemeChoice, boardWindow: Window | null): void {
    if (PreferenceStore.readText(THEME_STORAGE_KEY) !== themeChoice) PreferenceStore.writeText(THEME_STORAGE_KEY, themeChoice);
    boardWindow?.document.querySelector<HTMLElement>(`#ap-theme [data-theme="${themeChoice}"]`)?.click();
  }

  bridgeWindow.addEventListener('message', (event) => {
    const message = BoardBridgeMessageUtil.themeMessageFrom(event, { origins: dashboardOrigins, window: bridgeWindow.parent });
    if (message === null) return;
    dashboardOrigin = event.origin;
    try {
      showTheme(message.themeChoice, followTheBoard());
    } catch {
      // The board went between documents; the next load sends the theme again.
    }
  });

  // The board's own toggle writes the shared key; the storage event reaches every other document of the board origin.
  bridgeWindow.addEventListener('storage', (event) => {
    if (event.key === THEME_STORAGE_KEY) tellTheDashboard({ kind: 'theme-chosen', themeChoice: ThemeChoiceUtil.choiceOf(event.newValue) });
  });
}
