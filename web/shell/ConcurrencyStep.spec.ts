/**
 * A step from the shown limit: one up or one down, and no step at all past the CLI's bounds of 1 and 10, which is
 * what disables the plus at 10 and the minus at 1.
 */
import { expect, test }              from 'bun:test';
import { steppedConcurrencyLimitOf } from './ConcurrencyStep.ts';

test('raising and lowering move the shown limit by one', () => {
  expect(steppedConcurrencyLimitOf(3, 'raise')).toBe(4);
  expect(steppedConcurrencyLimitOf(3, 'lower')).toBe(2);
});

test('there is no raise from 10 and no lower from 1', () => {
  expect(steppedConcurrencyLimitOf(10, 'raise')).toBeNull();
  expect(steppedConcurrencyLimitOf(1, 'lower')).toBeNull();
});

test('the bounds themselves are reachable', () => {
  expect(steppedConcurrencyLimitOf(9, 'raise')).toBe(10);
  expect(steppedConcurrencyLimitOf(2, 'lower')).toBe(1);
});
