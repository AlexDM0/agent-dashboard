/** The document a frame holds before its own page arrives, already complete though nothing has loaded. */
const INITIAL_FRAME_URL = 'about:blank';

export interface LoadableBoardFrame {
  contentDocument:     Pick<Document, 'readyState' | 'URL'> | null;
  addEventListener:    (type: 'load', listener: () => void) => void;
  removeEventListener: (type: 'load', listener: () => void) => void;
}

function holdsCompleteBoard(frame: LoadableBoardFrame): boolean {
  const boardDocument = frame.contentDocument;
  return boardDocument !== null && boardDocument.readyState === 'complete' && boardDocument.URL !== INITIAL_FRAME_URL;
}

/**
 * Calls `onBoardLoaded` on every load of the frame, and at once when its board finished loading before this was
 * attached. Returns the function that stops following.
 */
export function followBoardFrameLoads(frame: LoadableBoardFrame, onBoardLoaded: () => void): () => void {
  frame.addEventListener('load', onBoardLoaded);
  if (holdsCompleteBoard(frame)) {
    onBoardLoaded();
  }
  return () => frame.removeEventListener('load', onBoardLoaded);
}
