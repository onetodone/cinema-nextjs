import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayParts,
  daysBetween,
  formatCountdown,
  formatDay,
  formatDuration,
  formatLongDay,
  formatShowtime,
  formatShowtimeDateTime,
  formatTimeAgo,
  instantOf,
  isIsoDate,
  localDateOf,
  parseDateTime,
  relativeDayLabel,
  remainingMs,
} from '@/lib/time'

describe('parseDateTime', () => {
  it('keeps the wall-clock time of the offset and computes the instant', () => {
    const parsed = parseDateTime('2026-10-01T19:30:00+02:00')

    expect(parsed?.wallClock.toISOString()).toBe('2026-10-01T19:30:00.000Z')
    expect(parsed?.instant).toBe(Date.parse('2026-10-01T17:30:00Z'))
    expect(parsed?.offsetMinutes).toBe(120)
  })

  it('accepts Z, negative offsets, lowercase t, missing seconds, and fractions', () => {
    expect(parseDateTime('2026-10-01T19:30:00Z')?.instant).toBe(Date.parse('2026-10-01T19:30:00Z'))
    expect(parseDateTime('2026-10-01T19:30:00-05:30')?.instant).toBe(Date.parse('2026-10-02T01:00:00Z'))
    expect(parseDateTime('2026-10-01t19:30z')?.instant).toBe(Date.parse('2026-10-01T19:30:00Z'))
    expect(parseDateTime('2026-10-01T19:30:00.123456Z')?.instant).toBe(Date.parse('2026-10-01T19:30:00.123Z'))
  })

  it('rejects malformed and impossible values', () => {
    expect(parseDateTime('2026-10-01')).toBeNull()
    expect(parseDateTime('2026-10-01T19:30:00')).toBeNull()
    expect(parseDateTime('2026-02-30T10:00:00Z')).toBeNull()
    expect(parseDateTime('2026-10-01T24:00:00Z')).toBeNull()
    expect(parseDateTime('not a date')).toBeNull()
    expect(instantOf('garbage')).toBeNaN()
  })
})

describe('formatting in the cinema wall-clock', () => {
  // The same instant in two zones must print the time each cinema sees, whatever the machine's zone.
  it('never converts to another zone', () => {
    expect(formatShowtime('2026-10-01T19:30:00+02:00')).toBe('7:30 PM')
    expect(formatShowtime('2026-10-01T19:30:00-07:00')).toBe('7:30 PM')
    expect(formatShowtime('2026-10-01T00:05:00+14:00')).toBe('12:05 AM')
  })

  it('formats days and date-times', () => {
    expect(formatShowtimeDateTime('2026-09-27T21:45:00+03:00')).toBe('Sun, Sep 27, 9:45 PM')
    expect(formatDay('2026-09-27')).toBe('Sun, Sep 27')
    expect(formatLongDay('2026-09-27')).toBe('Sunday, September 27')
    expect(dayParts('2026-10-05')).toEqual({ weekday: 'Mon', day: '5', month: 'Oct' })
  })

  it('takes the calendar day from the offset, not from UTC', () => {
    expect(localDateOf('2026-09-27T23:30:00-04:00')).toBe('2026-09-27')
    expect(localDateOf('2026-09-28T00:30:00+02:00')).toBe('2026-09-28')
  })

  it('falls back to empty text for unparsable timestamps', () => {
    expect(formatShowtime('soon')).toBe('')
    expect(formatShowtimeDateTime('soon')).toBe('')
  })
})

describe('calendar days', () => {
  it('validates YYYY-MM-DD', () => {
    expect(isIsoDate('2026-09-27')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-9-27')).toBe(false)
    expect(isIsoDate('2026-09-27T00:00:00Z')).toBe(false)
  })

  it('adds days across months and years', () => {
    expect(addDays('2026-09-27', 1)).toBe('2026-09-28')
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-09-27', '2026-10-10')).toBe(13)
  })

  it('labels today and tomorrow relative to the cinema date', () => {
    expect(relativeDayLabel('2026-09-27', '2026-09-27')).toBe('Today')
    expect(relativeDayLabel('2026-09-28', '2026-09-27')).toBe('Tomorrow')
    expect(relativeDayLabel('2026-09-29', '2026-09-27')).toBe('Tue, Sep 29')
    expect(relativeDayLabel('2026-09-26', '2026-09-27')).toBe('Sat, Sep 26')
  })
})

describe('durations and countdowns', () => {
  it('formats movie lengths', () => {
    expect(formatDuration(118)).toBe('1 h 58 min')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2 h')
  })

  it('counts down to a deadline with the server clock skew', () => {
    const now = Date.parse('2026-09-27T12:00:00Z')

    expect(remainingMs('2026-09-27T12:15:00Z', now)).toBe(15 * 60_000)
    // The server clock is 30 s ahead of this one: 30 s less remain.
    expect(remainingMs('2026-09-27T12:15:00Z', now, 30_000)).toBe(14.5 * 60_000)
    expect(remainingMs('2026-09-27T11:59:00Z', now)).toBe(0)
    expect(remainingMs('bad', now)).toBe(0)
  })

  it('shows minutes and seconds, reaching 0:00 only at the end', () => {
    expect(formatCountdown(15 * 60_000)).toBe('15:00')
    expect(formatCountdown(754_000)).toBe('12:34')
    expect(formatCountdown(200)).toBe('0:01')
    expect(formatCountdown(0)).toBe('0:00')
    expect(formatCountdown(-5)).toBe('0:00')
  })
})

describe('formatTimeAgo', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')

  it('says how long ago an account timestamp was', () => {
    expect(formatTimeAgo('2026-09-27T11:59:30Z', now)).toBe('just now')
    expect(formatTimeAgo('2026-09-27T11:59:00Z', now)).toBe('1 minute ago')
    expect(formatTimeAgo('2026-09-27T11:15:00Z', now)).toBe('45 minutes ago')
    expect(formatTimeAgo('2026-09-27T09:00:00Z', now)).toBe('3 hours ago')
    expect(formatTimeAgo('2026-09-26T08:00:00Z', now)).toBe('yesterday')
    expect(formatTimeAgo('2026-09-15T12:00:00Z', now)).toBe('12 days ago')
    expect(formatTimeAgo('2026-08-01T12:00:00Z', now)).toBe('on August 1, 2026')
  })

  it('treats a moment ahead of the clock as now, and ignores what it cannot read', () => {
    expect(formatTimeAgo('2026-09-27T12:02:00Z', now)).toBe('just now')
    expect(formatTimeAgo('bad', now)).toBe('')
  })
})
