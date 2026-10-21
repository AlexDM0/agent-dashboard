/** A ticket id as the boards print it, `#042`; an id that already carries its mark is left alone. */
export function ticketReferenceOf(ticketId: string): string {
  return ticketId.startsWith('#') ? ticketId : `#${ticketId}`;
}
