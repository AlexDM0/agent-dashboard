/**
 * A popover (the inbox, the dashboard menu) closes on a press outside its container: a press on any node it holds
 * keeps it open, while a press elsewhere, one without a target node, or one before the container mounted closes it.
 */
import { expect, test }   from 'bun:test';
import { isPressOutside } from './PressOutside.ts';

test('a press inside the container keeps the popover open; one outside it, without a target or without a container closes it', () => {
  const containerNodes = new Set(['toggle', 'panel', 'entry-link']);
  const container = { contains: (target: string) => containerNodes.has(target) };
  expect(isPressOutside(container, 'entry-link')).toBe(false);
  expect(isPressOutside(container, 'toggle')).toBe(false);
  expect(isPressOutside(container, 'board-header')).toBe(true);
  expect(isPressOutside(container, null)).toBe(true);
  expect(isPressOutside(null, 'panel')).toBe(true);
});
