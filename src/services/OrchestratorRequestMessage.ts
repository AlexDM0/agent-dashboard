/**
 * What the dashboard says to a board's orchestrator session on the user's click: the request a body asks for, and the
 * message text it becomes. The message is the whole effect; the orchestrator decides what to do with it.
 */
import { type OrchestratorRecipient, type OrchestratorRequest } from '../shared/DashboardContract.ts';
import { DASHBOARD_LIMITS }                                     from '../shared/constants/DashboardLimits.ts';

export const ORCHESTRATOR_REQUEST_BODY_REFUSAL = 'The body must be { "kind": "start-building" } or '
  + `{ "kind": "clear-low-tickets", "ticketIds": [...] } with 1 to ${DASHBOARD_LIMITS.MAXIMUM_CLEARED_TICKET_COUNT} non-empty ticket ids`;

/** The skill refuses model invocation, so a started session's first user turn opens with its slash command instead. */
export const ORCHESTRATE_SKILL_COMMAND = '/agent-progress-orchestrate';

/** A session the dashboard starts has its board in the dashboard's frame already, so the skill's browser step is skipped. */
export const BOARD_ALREADY_SHOWN_INSTRUCTION = 'The agent-dashboard already shows this board: skip `agent-progress open` '
  + 'and open no browser window or tab for it.';

const RELAY_OPENING = 'This message relays the user\'s click in the agent-dashboard, for the project';

const START_BUILDING_INSTRUCTION = 'The user asks you to start building: run this board through the agent-progress '
  + 'dispatcher (`.agent-progress/agent-progress-dispatch.js`). If a dispatcher '
  + 'run is already in flight, leave it running and start no second one.';

const START_ORCHESTRATING_INSTRUCTION = 'The user started you as this board\'s orchestrator: read the board. '
  + 'Launch no dispatcher run until the user asks you to start building.';

const CLEAR_LOW_TICKETS_INSTRUCTION = 'The user cleared these low-priority tickets to run. Triage them, then launch the '
  + 'agent-progress dispatcher with `includeLowPriority: true` once no dispatcher run is in flight. Never stop a running '
  + 'dispatcher for this. The tickets:';

/** The request a body asks for, or null when it is not JSON, names no known kind, or lists ticket ids badly. */
export function orchestratorRequestOf(bodyText: string): OrchestratorRequest | null {
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !Object.hasOwn(body, 'kind')) return null;
  const { kind } = body as Record<string, unknown>;
  if (kind === 'start-building') return { kind };
  if (kind !== 'clear-low-tickets' || !Object.hasOwn(body, 'ticketIds')) return null;
  const { ticketIds } = body as Record<string, unknown>;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0 || ticketIds.length > DASHBOARD_LIMITS.MAXIMUM_CLEARED_TICKET_COUNT) return null;
  if (!ticketIds.every((ticketId): ticketId is string => typeof ticketId === 'string' && ticketId.length > 0)) return null;
  return { kind, ticketIds };
}

const CONFIRM_WITH_USER_REQUEST = 'This reached you as a message from another session, which never carries your user\'s '
  + 'go: ask your user to confirm before you run the dispatcher or triage anything for it.';

export function orchestratorMessageTextOf(request: OrchestratorRequest, project: string, recipient: OrchestratorRecipient): string {
  const requestText = requestTextOf(request, project);
  return recipient === 'dashboard-session' ? requestText : `${requestText} ${CONFIRM_WITH_USER_REQUEST}`;
}

/** The first message of an orchestrator started without the go to build. */
export function orchestratorStartTextOf(project: string): string {
  return `${ORCHESTRATE_SKILL_COMMAND}\n${BOARD_ALREADY_SHOWN_INSTRUCTION}\n${RELAY_OPENING} ${project}. ${START_ORCHESTRATING_INSTRUCTION}`;
}

/** The first message of an orchestrator started with the go to build. */
export function orchestratorStartBuildingTextOf(project: string): string {
  return `${ORCHESTRATE_SKILL_COMMAND}\n${BOARD_ALREADY_SHOWN_INSTRUCTION}\n${requestTextOf({ kind: 'start-building' }, project)}`;
}

function requestTextOf(request: OrchestratorRequest, project: string): string {
  const opening = `${RELAY_OPENING} ${project}.`;
  if (request.kind === 'start-building') return `${opening} ${START_BUILDING_INSTRUCTION}`;
  return `${opening} ${CLEAR_LOW_TICKETS_INSTRUCTION} ${request.ticketIds.map((ticketId) => `#${ticketId}`).join(', ')}.`;
}
