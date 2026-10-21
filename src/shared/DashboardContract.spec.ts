/**
 * The contract is types only; this suite proves the module loads under Bun and that a status survives the JSON trip
 * the server and the web make with every snapshot.
 */
import { expect, test }      from 'bun:test';
import { type TicketStatus } from './DashboardContract.ts';

test('a ticket status survives a JSON round trip unchanged', () => {
  const status: TicketStatus = 'in-review';
  const roundTripped = JSON.parse(JSON.stringify({ status })) as { status: TicketStatus };
  expect(roundTripped.status).toBe(status);
});
