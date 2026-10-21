/** The remote URL forms git writes, each shortened to owner/repo, and an unrecognised one kept whole. */
import { expect, test }  from 'bun:test';
import { shortOriginOf } from './OriginShortening.ts';

test('an scp-style remote shortens to owner/repo', () => {
  expect(shortOriginOf('git@example.invalid:example/example-storefront.git')).toBe('example/example-storefront');
});

test('an https remote shortens with or without .git and a trailing slash', () => {
  expect(shortOriginOf('https://example.invalid/example/invoice-service.git')).toBe('example/invoice-service');
  expect(shortOriginOf('https://example.invalid/example/invoice-service/')).toBe('example/invoice-service');
});

test('a value with no owner and repository is shown as given', () => {
  expect(shortOriginOf('local-only')).toBe('local-only');
});
