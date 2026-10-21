/**
 * The frame stays hidden until its board has loaded, so a load must never be missed: one that completed before the
 * listener was attached counts at once, while the frame's initial about:blank or a board still loading does not, and
 * after the stop no load is followed. The frame is an event target with a document whose state the spec decides.
 */
import { expect, test } from 'bun:test';

import { followBoardFrameLoads, type LoadableBoardFrame } from './BoardFrameLoad.ts';

interface FakeFrame {
  frame: LoadableBoardFrame;
  load:  () => void;
}

function fakeFrame(readyState: DocumentReadyState, url: string): FakeFrame {
  const target = new EventTarget();
  const frame: LoadableBoardFrame = {
    contentDocument:     { readyState, URL: url },
    addEventListener:    (type, listener) => target.addEventListener(type, listener),
    removeEventListener: (type, listener) => target.removeEventListener(type, listener),
  };
  return { frame, load: () => target.dispatchEvent(new Event('load')) };
}

const BOARD_URL = 'http://127.0.0.1:4100/projects/example-agency/progress.html';

test('a board already complete when the listener attaches counts as loaded at once', () => {
  let isBoardLoaded = false;
  followBoardFrameLoads(fakeFrame('complete', BOARD_URL).frame, () => { isBoardLoaded = true; });
  expect(isBoardLoaded).toBe(true);
});

test('the frame\'s initial about:blank is not a loaded board', () => {
  let loadCount = 0;
  followBoardFrameLoads(fakeFrame('complete', 'about:blank').frame, () => { loadCount++; });
  expect(loadCount).toBe(0);
});

test('a board still loading counts only once its load event fires', () => {
  let loadCount = 0;
  const board = fakeFrame('interactive', BOARD_URL);
  followBoardFrameLoads(board.frame, () => { loadCount++; });
  expect(loadCount).toBe(0);
  board.load();
  expect(loadCount).toBe(1);
});

test('a frame from another origin, its document unreachable, waits for its load event', () => {
  let loadCount = 0;
  const board = fakeFrame('complete', BOARD_URL);
  followBoardFrameLoads({ ...board.frame, contentDocument: null }, () => { loadCount++; });
  expect(loadCount).toBe(0);
});

test('once stopped, a load is no longer followed', () => {
  let loadCount = 0;
  const board = fakeFrame('loading', BOARD_URL);
  const stopFollowing = followBoardFrameLoads(board.frame, () => { loadCount++; });
  stopFollowing();
  board.load();
  expect(loadCount).toBe(0);
});
