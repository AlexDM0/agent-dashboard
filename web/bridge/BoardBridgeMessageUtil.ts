/**
 * The messages the dashboard and the bridge on the board origin exchange by `postMessage`, and the one check each side
 * makes before acting on one: the sender's origin and window are the expected ones, and the data has the exact shape.
 */
import { THEME_CHOICES, type ThemeChoice } from '../preferences/ThemeChoiceUtil.ts';

/** The name of the frame holding `progress.html`, by which the bridge finds its sibling. */
export const BOARD_FRAME_NAME = 'agent-dashboard-board';

/** The dashboard to the bridge: the theme to show, sent on every choice and every load of either frame. */
export interface ThemeMessage { kind: 'theme'; themeChoice: ThemeChoice }

/** The bridge to the dashboard: the board's own toggle chose a theme, Esc left the board, or the board is reloading. */
export type BridgeMessage =
  | { kind: 'theme-chosen'; themeChoice: ThemeChoice }
  | { kind: 'leave-board' }
  | { kind: 'board-unloading' };

export interface ReceivedMessage {
  origin: string;
  source: unknown;
  data:   unknown;
}

export interface ExpectedSender {
  origins: ReadonlySet<string>;
  window:  unknown;
}

function isFromExpectedSender(message: ReceivedMessage, sender: ExpectedSender): boolean {
  return sender.origins.has(message.origin) && sender.window !== null && message.source === sender.window;
}

function themeChoiceOrNull(value: unknown): ThemeChoice | null {
  return THEME_CHOICES.find((choice) => choice === value) ?? null;
}

function fieldsOf(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

/** What the bridge acts on: a theme message from the dashboard's own window and origin, else null. */
function themeMessageFrom(message: ReceivedMessage, dashboard: ExpectedSender): ThemeMessage | null {
  const fields = fieldsOf(message.data);
  if (!isFromExpectedSender(message, dashboard) || fields?.['kind'] !== 'theme') return null;
  const themeChoice = themeChoiceOrNull(fields['themeChoice']);
  return themeChoice === null ? null : { kind: 'theme', themeChoice };
}

/** What the dashboard acts on: a bridge message from the bridge frame's window on the board origin, else null. */
function bridgeMessageFrom(message: ReceivedMessage, bridge: ExpectedSender): BridgeMessage | null {
  const fields = fieldsOf(message.data);
  if (!isFromExpectedSender(message, bridge) || fields === null) return null;
  if (fields['kind'] === 'leave-board' || fields['kind'] === 'board-unloading') return { kind: fields['kind'] };
  if (fields['kind'] !== 'theme-chosen') return null;
  const themeChoice = themeChoiceOrNull(fields['themeChoice']);
  return themeChoice === null ? null : { kind: 'theme-chosen', themeChoice };
}

export const BoardBridgeMessageUtil = Object.freeze({ themeMessageFrom, bridgeMessageFrom });
