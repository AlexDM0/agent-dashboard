/**
 * Esc inside the embedded board leaves it for the overview, as it does in the dashboard's own document, unless the
 * board used the key itself: to close its detail panel or a popover, or by preventing its default.
 */

/** What the board shows over itself and closes on Esc: the detail panel (a `<dialog>`) and its popovers. */
const OPEN_LAYER_SELECTOR = 'dialog[open], [role="dialog"]:not([hidden])';

export interface EmbeddedBoardWindow {
  document:            Pick<Document, 'querySelector'>;
  addEventListener:    (type: 'keydown', listener: (event: KeyboardEvent) => void, capture?: boolean) => void;
  removeEventListener: (type: 'keydown', listener: (event: KeyboardEvent) => void, capture?: boolean) => void;
}

/**
 * The capture listener runs before the board's own handlers and notes whether a layer was open; the bubbling one runs
 * after them. Returns the function that stops following.
 */
export function followEscapeInEmbeddedBoard(boardWindow: EmbeddedBoardWindow, leaveTheBoard: () => void): () => void {
  let layerWasOpen = false;
  const noteOpenLayer = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      layerWasOpen = boardWindow.document.querySelector(OPEN_LAYER_SELECTOR) !== null;
    }
  };
  const leaveOnEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.defaultPrevented && !layerWasOpen) {
      leaveTheBoard();
    }
  };
  boardWindow.addEventListener('keydown', noteOpenLayer, true);
  boardWindow.addEventListener('keydown', leaveOnEscape);
  return () => {
    boardWindow.removeEventListener('keydown', noteOpenLayer, true);
    boardWindow.removeEventListener('keydown', leaveOnEscape);
  };
}
