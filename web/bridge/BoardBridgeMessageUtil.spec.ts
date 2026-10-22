/**
 * The bridge and the dashboard each act only on a message from the other: the bridge on the dashboard's window from one
 * of the dashboard's origins, the dashboard on the bridge frame's window from the board origin. A message from any other
 * origin or window, the right origin from the wrong window (a board page posting itself), or a wrong shape is ignored.
 */
import { expect, test } from 'bun:test';

import { BoardBridgeMessageUtil, type ExpectedSender } from './BoardBridgeMessageUtil.ts';

const DASHBOARD_ORIGIN = 'http://127.0.0.1:4710';
const BOARD_ORIGIN = 'http://127.0.0.1:4711';
const dashboardWindow = { name: 'dashboard window' };
const bridgeWindow = { name: 'bridge window' };
const boardWindow = { name: 'board window' };

const dashboard: ExpectedSender = { origins: new Set([DASHBOARD_ORIGIN, 'http://localhost:4710']), window: dashboardWindow };
const bridge: ExpectedSender = { origins: new Set([BOARD_ORIGIN]), window: bridgeWindow };

test('the bridge takes a theme message from the dashboard window on any of its origins', () => {
  const data = { kind: 'theme', themeChoice: 'dark' };
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: DASHBOARD_ORIGIN, source: dashboardWindow, data }, dashboard)).toEqual({ kind: 'theme', themeChoice: 'dark' });
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: 'http://localhost:4710', source: dashboardWindow, data }, dashboard)).toEqual({ kind: 'theme', themeChoice: 'dark' });
});

test('the bridge ignores a theme message from another origin, another window or of another shape', () => {
  const data = { kind: 'theme', themeChoice: 'dark' };
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: BOARD_ORIGIN, source: dashboardWindow, data }, dashboard)).toBeNull();
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: 'http://evil.example', source: dashboardWindow, data }, dashboard)).toBeNull();
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: DASHBOARD_ORIGIN, source: boardWindow, data }, dashboard)).toBeNull();
  expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: DASHBOARD_ORIGIN, source: null, data }, { ...dashboard, window: null })).toBeNull();
  for (const malformed of [{ kind: 'theme', themeChoice: 'purple' }, { kind: 'theme' }, { kind: 'leave-board' }, 'theme', null, ['theme']]) {
    expect(BoardBridgeMessageUtil.themeMessageFrom({ origin: DASHBOARD_ORIGIN, source: dashboardWindow, data: malformed }, dashboard)).toBeNull();
  }
});

test('the dashboard takes each bridge message from the bridge window on the board origin', () => {
  const received = (data: unknown) => BoardBridgeMessageUtil.bridgeMessageFrom({ origin: BOARD_ORIGIN, source: bridgeWindow, data }, bridge);
  expect(received({ kind: 'theme-chosen', themeChoice: 'light' })).toEqual({ kind: 'theme-chosen', themeChoice: 'light' });
  expect(received({ kind: 'leave-board', extra: 'ignored' })).toEqual({ kind: 'leave-board' });
  expect(received({ kind: 'board-unloading' })).toEqual({ kind: 'board-unloading' });
});

test('the dashboard ignores a bridge message from another origin, from the board page itself, or of another shape', () => {
  const data = { kind: 'leave-board' };
  expect(BoardBridgeMessageUtil.bridgeMessageFrom({ origin: DASHBOARD_ORIGIN, source: bridgeWindow, data }, bridge)).toBeNull();
  expect(BoardBridgeMessageUtil.bridgeMessageFrom({ origin: 'http://evil.example', source: bridgeWindow, data }, bridge)).toBeNull();
  expect(BoardBridgeMessageUtil.bridgeMessageFrom({ origin: BOARD_ORIGIN, source: boardWindow, data }, bridge)).toBeNull();
  for (const malformed of [{ kind: 'theme-chosen', themeChoice: 'purple' }, { kind: 'theme', themeChoice: 'dark' }, { kind: 'reload' }, 'leave-board', null]) {
    expect(BoardBridgeMessageUtil.bridgeMessageFrom({ origin: BOARD_ORIGIN, source: bridgeWindow, data: malformed }, bridge)).toBeNull();
  }
});
