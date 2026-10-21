import { type ThemeChoice } from './ThemeChoiceUtil.ts';

/** Marks the iframe holding a project's `progress.html`, so a theme change reaches the board inside it. */
export const EMBEDDED_BOARD_ATTRIBUTE = 'data-embedded-board';

/**
 * Clicks the embedded page's own theme radio, so its toggle state and its document follow together; the page does
 * not listen for storage events. A page without the radio (not loaded yet) reads the stored choice when it loads.
 */
export function applyThemeToEmbeddedBoards(choice: ThemeChoice): void {
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(`iframe[${EMBEDDED_BOARD_ATTRIBUTE}]`)) {
    try {
      frame.contentDocument?.querySelector<HTMLElement>(`#ap-theme [data-theme="${choice}"]`)?.click();
    } catch {
      // A frame from another origin cannot be reached; it keeps its own theme.
    }
  }
}
