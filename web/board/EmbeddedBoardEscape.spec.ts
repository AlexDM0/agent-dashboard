/**
 * The board's own Esc handlers must keep priority: a key that closed its detail panel or a popover, or that it
 * prevented, must not also leave the board. A bare Esc does leave it, and after the stop nothing is followed. The
 * window is an event target with a document whose open layer the spec decides, the board's handler one more listener.
 */
import { expect, test } from 'bun:test';

import { type EmbeddedBoardWindow, followEscapeInEmbeddedBoard } from './EmbeddedBoardEscape.ts';

interface FakeBoard {
  boardWindow: EmbeddedBoardWindow;
  press:       (key: string) => void;
}

/** `boardHandler` stands in for the page's own keydown listener, registered before the dashboard's. */
function fakeBoard(layerIsOpen: () => boolean, boardHandler: (event: KeyboardEvent) => void = () => {}): FakeBoard {
  const target = new EventTarget();
  const boardWindow: EmbeddedBoardWindow = {
    document:            { querySelector: () => (layerIsOpen() ? {} as Element : null) },
    addEventListener:    (type, listener, capture) => target.addEventListener(type, listener as EventListener, capture),
    removeEventListener: (type, listener, capture) => target.removeEventListener(type, listener as EventListener, capture),
  };
  target.addEventListener('keydown', boardHandler as EventListener);
  return {
    boardWindow,
    press: (key) => {
      target.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
    },
  };
}

test('Esc with nothing open over the board leaves it, and any other key does not', () => {
  let leaveCount = 0;
  const board = fakeBoard(() => false);
  followEscapeInEmbeddedBoard(board.boardWindow, () => { leaveCount++; });
  board.press('Enter');
  expect(leaveCount).toBe(0);
  board.press('Escape');
  expect(leaveCount).toBe(1);
});

test('Esc that closes the board\'s open layer stays on the board', () => {
  let layerIsOpen = true;
  let leaveCount = 0;
  const board = fakeBoard(() => layerIsOpen, () => { layerIsOpen = false; });
  followEscapeInEmbeddedBoard(board.boardWindow, () => { leaveCount++; });
  board.press('Escape');
  expect(layerIsOpen).toBe(false);
  expect(leaveCount).toBe(0);
  board.press('Escape');
  expect(leaveCount).toBe(1);
});

test('Esc the board prevented stays on the board', () => {
  let leaveCount = 0;
  const board = fakeBoard(() => false, (event) => event.preventDefault());
  followEscapeInEmbeddedBoard(board.boardWindow, () => { leaveCount++; });
  board.press('Escape');
  expect(leaveCount).toBe(0);
});

test('once stopped, Esc is no longer followed', () => {
  let leaveCount = 0;
  const board = fakeBoard(() => false);
  const stopFollowing = followEscapeInEmbeddedBoard(board.boardWindow, () => { leaveCount++; });
  stopFollowing();
  board.press('Escape');
  expect(leaveCount).toBe(0);
});
