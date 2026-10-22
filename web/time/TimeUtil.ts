/**
 * The page's one formatter for elapsed time and log stamps. Nothing here reads the clock: "now" is handed in. A log
 * stamp is sliced, never re-parsed, so it keeps the wall clock of the machine that wrote it; only an age parses.
 */
import { MONTH_NAMES, STAMP_SLICES, TIME_UNITS } from '../constants/TimeUnits.ts';
import { WEB_LIMITS }                            from '../constants/WebLimits.ts';

function padToTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function calendarDateOf(epochMilliseconds: number): string {
  const moment = new Date(epochMilliseconds);
  return `${moment.getFullYear()}-${padToTwoDigits(moment.getMonth() + 1)}-${padToTwoDigits(moment.getDate())}`;
}

function relativeAgeOfInstant(epochMilliseconds: number, nowEpochMilliseconds: number): string {
  const seconds = Math.max(0, Math.floor((nowEpochMilliseconds - epochMilliseconds) / TIME_UNITS.MILLISECONDS_PER_SECOND));
  if (seconds < TIME_UNITS.SECONDS_PER_MINUTE) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / TIME_UNITS.SECONDS_PER_MINUTE);
  if (minutes < TIME_UNITS.MINUTES_PER_HOUR) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / TIME_UNITS.MINUTES_PER_HOUR);
  if (hours < TIME_UNITS.HOURS_PER_DAY) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / TIME_UNITS.HOURS_PER_DAY)}d`;
}

/** An empty text for a stamp that does not parse, so a malformed value shows nothing rather than "NaN". */
function relativeAgeOfStamp(stamp: string, nowEpochMilliseconds: number): string {
  const stampEpochMilliseconds = Date.parse(stamp);
  if (Number.isNaN(stampEpochMilliseconds)) {
    return '';
  }
  return relativeAgeOfInstant(stampEpochMilliseconds, nowEpochMilliseconds);
}

/** "just now" under the threshold or for an instant after now, else "<age> ago". */
function agoPhraseOfInstant(epochMilliseconds: number, nowEpochMilliseconds: number): string {
  const elapsedSeconds = (nowEpochMilliseconds - epochMilliseconds) / TIME_UNITS.MILLISECONDS_PER_SECOND;
  if (elapsedSeconds < WEB_LIMITS.JUST_NOW_THRESHOLD_SECONDS) {
    return 'just now';
  }
  return `${relativeAgeOfInstant(epochMilliseconds, nowEpochMilliseconds)} ago`;
}

/** An empty text for a stamp that does not parse, as `relativeAgeOfStamp` gives. */
function agoPhraseOfStamp(stamp: string, nowEpochMilliseconds: number): string {
  const stampEpochMilliseconds = Date.parse(stamp);
  if (Number.isNaN(stampEpochMilliseconds)) {
    return '';
  }
  return agoPhraseOfInstant(stampEpochMilliseconds, nowEpochMilliseconds);
}

/** The viewer's local wall clock of an instant, `HH:MM`. */
function clockOfInstant(epochMilliseconds: number): string {
  const moment = new Date(epochMilliseconds);
  return `${padToTwoDigits(moment.getHours())}:${padToTwoDigits(moment.getMinutes())}`;
}

function clockOfStamp(stamp: string): string {
  return stamp.slice(STAMP_SLICES.CLOCK_START, STAMP_SLICES.CLOCK_END);
}

/** The clock for a stamp from the viewer's day, else its month and day ("Oct 18"), else its year as well. */
function logStampText(stamp: string, nowEpochMilliseconds: number): string {
  const today = calendarDateOf(nowEpochMilliseconds);
  if (stamp.slice(0, STAMP_SLICES.CALENDAR_DATE_END) === today) {
    return clockOfStamp(stamp);
  }
  const monthName = MONTH_NAMES[Number(stamp.slice(STAMP_SLICES.MONTH_START, STAMP_SLICES.MONTH_END)) - 1];
  const dayOfMonth = Number(stamp.slice(STAMP_SLICES.DAY_START, STAMP_SLICES.CALENDAR_DATE_END));
  if (monthName === undefined || Number.isNaN(dayOfMonth)) {
    return stamp;
  }
  const year = stamp.slice(0, STAMP_SLICES.YEAR_END);
  return year === today.slice(0, STAMP_SLICES.YEAR_END) ? `${monthName} ${dayOfMonth}` : `${monthName} ${dayOfMonth} ${year}`;
}

export const TimeUtil = Object.freeze({
  relativeAgeOfInstant, relativeAgeOfStamp, agoPhraseOfInstant, agoPhraseOfStamp, clockOfInstant, clockOfStamp, logStampText
});
