/** A press lands outside a popover unless its container holds the target; a press with no target node counts as outside. */
export function isPressOutside<Target>(container: { contains(target: Target): boolean } | null, target: Target | null): boolean {
  if (container === null || target === null) return true;
  return !container.contains(target);
}
