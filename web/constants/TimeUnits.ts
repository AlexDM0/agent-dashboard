export const TIME_UNITS = {
  MILLISECONDS_PER_SECOND: 1_000,
  SECONDS_PER_MINUTE:      60,
  MINUTES_PER_HOUR:        60,
  HOURS_PER_DAY:           24,
} as const;

/** Character positions in an ISO stamp such as `2026-10-21T16:24:17+02:00`, so its wall clock is sliced as written. */
export const STAMP_SLICES = {
  YEAR_END:          4,
  MONTH_START:       5,
  MONTH_END:         7,
  DAY_START:         8,
  CALENDAR_DATE_END: 10,
  CLOCK_START:       11,
  CLOCK_END:         16,
} as const;

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
