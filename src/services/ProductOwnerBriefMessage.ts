/**
 * What the dashboard says first to a project's product-owner session, its whole brief: the role, the skill, what it
 * never does, and in `spar` mode the wrap-up rule. A session has no system prompt, so this message is the brief.
 */
import type { ProductOwnerMode } from '../shared/DashboardContract.ts';

export const PRODUCT_OWNER_START_BODY_REFUSAL = 'The body must be { "mode": "spar" } or { "mode": "file" }';

/** The text the overlay's Wrap up button sends, and the words a sparring product owner files on. */
export const PRODUCT_OWNER_WRAP_UP_TEXT = 'wrap up';

const PRODUCT_OWNER_SKILL_COMMAND = '/agent-po';

const ROLE_INSTRUCTION = 'You are this project\'s product owner, started from the agent-dashboard: talk the user\'s '
  + 'ideas, bugs and questions into tickets on this board with the agent-progress CLI.';

const PROHIBITIONS = 'Never load the `agent-progress-orchestrate` skill, never dispatch an agent or run the dispatcher, '
  + 'and never claim or start a ticket: the project\'s orchestrator runs the board.';

const SPAR_INSTRUCTION = `This is a sparring session: file nothing until the user says "${PRODUCT_OWNER_WRAP_UP_TEXT}". `
  + 'Until then, question, challenge and shape the ideas with the user. Once the user says it, file the tickets that '
  + 'were agreed, and nothing else.';

const FILE_INSTRUCTION = 'File each ticket as soon as the user and you have agreed on it.';

/** The mode a body asks for, or null when it is not JSON or is anything but `{ "mode": "spar" | "file" }`. */
export function productOwnerModeOf(bodyText: string): ProductOwnerMode | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'mode') return null;
  const { mode } = body as Record<string, unknown>;
  return mode === 'spar' || mode === 'file' ? mode : null;
}

export function productOwnerBriefTextOf(project: string, mode: ProductOwnerMode): string {
  const modeInstruction = mode === 'spar' ? SPAR_INSTRUCTION : FILE_INSTRUCTION;
  return `${PRODUCT_OWNER_SKILL_COMMAND}\nThe project is ${project}. ${ROLE_INSTRUCTION} ${PROHIBITIONS} ${modeInstruction}`;
}
