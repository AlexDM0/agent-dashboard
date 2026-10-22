import { type BridgeMessage, BoardBridgeMessageUtil, type ThemeMessage } from '../bridge/BoardBridgeMessageUtil.ts';
import { type ThemeChoice }                                              from './ThemeChoiceUtil.ts';

/** Marks the frame holding a board's bridge, its value the board origin, so a theme change reaches the board beside it. */
export const BOARD_BRIDGE_ORIGIN_ATTRIBUTE = 'data-board-bridge-origin';

function bridgeFrames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll<HTMLIFrameElement>(`iframe[${BOARD_BRIDGE_ORIGIN_ATTRIBUTE}]`)];
}

/** Sends the choice to every bridge, which shows it on its board; a bridge not loaded yet drops it and is sent it on load. */
export function applyThemeToEmbeddedBoards(choice: ThemeChoice): void {
  const message: ThemeMessage = { kind: 'theme', themeChoice: choice };
  for (const frame of bridgeFrames()) {
    const boardOrigin = frame.getAttribute(BOARD_BRIDGE_ORIGIN_ATTRIBUTE);
    if (boardOrigin !== null) frame.contentWindow?.postMessage(message, boardOrigin);
  }
}

/** The message a bridge frame on its board origin sent, or null for any other sender. */
export function bridgeMessageOfEvent(event: MessageEvent): BridgeMessage | null {
  for (const frame of bridgeFrames()) {
    const boardOrigin = frame.getAttribute(BOARD_BRIDGE_ORIGIN_ATTRIBUTE) ?? '';
    const message = BoardBridgeMessageUtil.bridgeMessageFrom(event, { origins: new Set([boardOrigin]), window: frame.contentWindow });
    if (message !== null) return message;
  }
  return null;
}

/** Follows a theme an embedded board's own toggle chose. Returns the function that stops following. */
export function followThemesChosenInEmbeddedBoards(chooseTheme: (choice: ThemeChoice) => void): () => void {
  const followChosenTheme = (event: MessageEvent): void => {
    const message = bridgeMessageOfEvent(event);
    if (message?.kind === 'theme-chosen') chooseTheme(message.themeChoice);
  };
  window.addEventListener('message', followChosenTheme);
  return () => window.removeEventListener('message', followChosenTheme);
}
