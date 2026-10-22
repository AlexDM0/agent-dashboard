/**
 * The ages the header, the cards and the in-flight rows print: each unit boundary, a stamp from the future (clock
 * skew) and an unparsable one. Log stamps are sliced as written, so a stamp from another offset keeps its own clock;
 * the day comparison uses the viewer's local calendar date, built here the same way.
 */
import { describe, expect, test } from 'bun:test';
import { TimeUtil }               from './TimeUtil.ts';

const NOW = Date.parse('2026-10-21T14:00:00Z');

function localStampOf(epochMilliseconds: number, clock: string): string {
  const moment = new Date(epochMilliseconds);
  const month = String(moment.getMonth() + 1).padStart(2, '0');
  const day = String(moment.getDate()).padStart(2, '0');
  return `${moment.getFullYear()}-${month}-${day}T${clock}:00+02:00`;
}

describe('relativeAgeOfInstant', () => {
  test('under a minute is whole seconds', () => {
    expect(TimeUtil.relativeAgeOfInstant(NOW - 12_400, NOW)).toBe('12s');
  });
  test('a minute up to an hour is whole minutes', () => {
    expect(TimeUtil.relativeAgeOfInstant(NOW - 60_000, NOW)).toBe('1m');
    expect(TimeUtil.relativeAgeOfInstant(NOW - 3_599_000, NOW)).toBe('59m');
  });
  test('an hour up to a day is whole hours', () => {
    expect(TimeUtil.relativeAgeOfInstant(NOW - 3 * 3_600_000, NOW)).toBe('3h');
  });
  test('a day or more is whole days', () => {
    expect(TimeUtil.relativeAgeOfInstant(NOW - 50 * 3_600_000, NOW)).toBe('2d');
  });
  test('an instant after now reads as no time at all', () => {
    expect(TimeUtil.relativeAgeOfInstant(NOW + 5_000, NOW)).toBe('0s');
  });
});

describe('agoPhraseOfInstant', () => {
  test('an age under thirty seconds reads just now', () => {
    expect(TimeUtil.agoPhraseOfInstant(NOW, NOW)).toBe('just now');
    expect(TimeUtil.agoPhraseOfInstant(NOW - 12_000, NOW)).toBe('just now');
    expect(TimeUtil.agoPhraseOfInstant(NOW - 29_900, NOW)).toBe('just now');
  });
  test('from thirty seconds on the age is followed by ago', () => {
    expect(TimeUtil.agoPhraseOfInstant(NOW - 30_000, NOW)).toBe('30s ago');
    expect(TimeUtil.agoPhraseOfInstant(NOW - 60_000, NOW)).toBe('1m ago');
  });
  test('an instant after now reads just now', () => {
    expect(TimeUtil.agoPhraseOfInstant(NOW + 5_000, NOW)).toBe('just now');
  });
});

describe('agoPhraseOfStamp', () => {
  test('a stamp with an offset is phrased against the same instant', () => {
    expect(TimeUtil.agoPhraseOfStamp('2026-10-21T15:56:00+02:00', NOW)).toBe('4m ago');
  });
  test('an unparsable stamp gives the same empty text as relativeAgeOfStamp', () => {
    expect(TimeUtil.agoPhraseOfStamp('not a stamp', NOW)).toBe(TimeUtil.relativeAgeOfStamp('not a stamp', NOW));
    expect(TimeUtil.agoPhraseOfStamp('not a stamp', NOW)).toBe('');
  });
});

describe('clockOfInstant', () => {
  test('an instant reads as the viewer\'s local hours and minutes, padded', () => {
    const instant = new Date(2026, 9, 21, 9, 5, 42).getTime();
    expect(TimeUtil.clockOfInstant(instant)).toBe('09:05');
  });
});

describe('relativeAgeOfStamp', () => {
  test('a stamp with an offset is aged against the same instant', () => {
    expect(TimeUtil.relativeAgeOfStamp('2026-10-21T15:56:00+02:00', NOW)).toBe('4m');
  });
  test('an unparsable stamp ages to an empty text', () => {
    expect(TimeUtil.relativeAgeOfStamp('not a stamp', NOW)).toBe('');
  });
});

describe('logStampText', () => {
  test('a stamp from the viewer\'s day shows its own clock, sliced as written', () => {
    expect(TimeUtil.logStampText(localStampOf(NOW, '20:15'), NOW)).toBe('20:15');
  });
  test('a stamp from another day of the year shows its month and day', () => {
    expect(TimeUtil.logStampText('2026-10-18T09:00:00+02:00', NOW)).toBe('Oct 18');
  });
  test('a stamp from another year adds the year', () => {
    expect(TimeUtil.logStampText('2025-01-02T09:00:00+01:00', NOW)).toBe('Jan 2 2025');
  });
  test('a stamp too malformed to slice is shown as given', () => {
    expect(TimeUtil.logStampText('yesterday', NOW)).toBe('yesterday');
  });
});

test('clockOfStamp slices the hours and minutes', () => {
  expect(TimeUtil.clockOfStamp('2026-10-21T16:24:17+02:00')).toBe('16:24');
});
