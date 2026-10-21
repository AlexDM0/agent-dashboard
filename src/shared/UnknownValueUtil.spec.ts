/**
 * Readers decide their verdicts from these answers, so an array or null must never pass as an object, and an error
 * without a string code must read as having none rather than throw.
 */
import { expect, test } from 'bun:test';

import { UnknownValueUtil } from './UnknownValueUtil.ts';

test('only a plain non-null, non-array object is a JSON object', () => {
  expect(UnknownValueUtil.isJsonObject({ project: 'example-storefront' })).toBe(true);
  for (const value of [null, [], 'text', 4710, undefined]) expect(UnknownValueUtil.isJsonObject(value)).toBe(false);
});

test('an error message is the Error\'s own message, anything else its text', () => {
  expect(UnknownValueUtil.errorMessageOf(new Error('Example failure'))).toBe('Example failure');
  expect(UnknownValueUtil.errorMessageOf('Example text')).toBe('Example text');
});

test('an error code is a string code when one is carried, otherwise null', () => {
  expect(UnknownValueUtil.errorCodeOf(Object.assign(new Error('Example'), { code: 'ENOENT' }))).toBe('ENOENT');
  expect(UnknownValueUtil.errorCodeOf(Object.assign(new Error('Example'), { code: 2 }))).toBeNull();
  expect(UnknownValueUtil.errorCodeOf(null)).toBeNull();
});
