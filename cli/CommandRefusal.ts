/** A refusal the person can act on: `cli/Main.ts` prints its message and exits 1. */
export class CommandRefusal extends Error {
  override readonly name = 'CommandRefusal';
}
