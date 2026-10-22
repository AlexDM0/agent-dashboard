import type { OrchestratorRequest, WaitingTicket } from '../../src/shared/DashboardContract.ts';

const TICKET_ID_ORDER = new Intl.Collator('en', { numeric: true });

/** The low-priority tickets picked to be cleared to run, kept as ids. */
export const LowTicketSelectionUtil = Object.freeze({
  toggledSelectionOf(selectedTicketIds: readonly string[], ticketId: string): string[] {
    return selectedTicketIds.includes(ticketId)
      ? selectedTicketIds.filter((selectedTicketId) => selectedTicketId !== ticketId)
      : [...selectedTicketIds, ticketId];
  },

  /** A ticket that stopped waiting since it was picked, cleared by hand or started, drops out of the selection. */
  stillWaitingSelectionOf(selectedTicketIds: readonly string[], waitingTickets: readonly WaitingTicket[]): string[] {
    return selectedTicketIds.filter((selectedTicketId) => waitingTickets.some((waitingTicket) => waitingTicket.ticketId === selectedTicketId));
  },

  clearRequestOf(selectedTicketIds: readonly string[]): OrchestratorRequest {
    return { kind: 'clear-low-tickets', ticketIds: [...selectedTicketIds].sort((a, b) => TICKET_ID_ORDER.compare(a, b)) };
  },
});
