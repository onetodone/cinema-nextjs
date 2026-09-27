// Showtimes arrive as RFC 3339 strings carrying the cinema's UTC offset. They are shown in the cinema's wall-clock
// time, never converted to the browser's zone: the wall-clock fields are read into a Date as if they were UTC and
// formatted with `timeZone: 'UTC'`. That needs no IANA zone data and formats identically on the server and the client
// (fixed locale), so there is no hydration mismatch.

const LOCALE = 'en-US'

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(?:([Zz])|([+-])(\d{2}):(\d{2}))$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export interface ParsedDateTime {
  /** The wall-clock fields in the sender's offset, stored as a UTC Date: format it with `timeZone: 'UTC'`. */
  wallClock: Date
  /** The absolute instant, in epoch milliseconds. */
  instant: number
  /** The sender's offset from UTC, in minutes. */
  offsetMinutes: number
}

export function parseDateTime(value: string): ParsedDateTime | null {
  const match = DATE_TIME_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0', fraction = '', zulu, sign, offsetHour, offsetMinute] = match

  const millis = fraction ? Math.floor(Number(`0${fraction}`) * 1000) : 0
  const wallClockMs = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, millis)
  const wallClock = new Date(wallClockMs)
  // Date.UTC rolls invalid fields over (Feb 30 → Mar 2); reject those instead of showing a different day.
  if (wallClock.getUTCDate() !== +day || wallClock.getUTCMonth() !== +month - 1 || +hour > 23 || +minute > 59) {
    return null
  }

  const offsetMinutes = zulu ? 0 : (sign === '-' ? -1 : 1) * (+offsetHour * 60 + +offsetMinute)
  return { wallClock, instant: wallClockMs - offsetMinutes * MINUTE_MS, offsetMinutes }
}

/** Epoch milliseconds of an RFC 3339 timestamp, or NaN when it cannot be parsed. */
export function instantOf(value: string): number {
  return parseDateTime(value)?.instant ?? Number.NaN
}

/** Whether a value is a real calendar day written as `YYYY-MM-DD`. */
export function isIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3]
}

function dateFromIso(value: string): Date {
  const match = DATE_PATTERN.exec(value)
  if (!match) throw new RangeError(`Invalid date: ${value}`)
  return new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]))
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` plus `days` calendar days (pure date math, no time zone involved). */
export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(dateFromIso(value).getTime() + days * DAY_MS))
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateFromIso(to).getTime() - dateFromIso(from).getTime()) / DAY_MS)
}

/** The cinema's calendar day of a showtime timestamp, as `YYYY-MM-DD`. */
export function localDateOf(value: string): string {
  const parsed = parseDateTime(value)
  return parsed ? toIsoDate(parsed.wallClock) : value.slice(0, 10)
}

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const longDayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
})
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: 'UTC' })
const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' })

/** "7:30 PM" in the cinema's wall-clock time. */
export function formatShowtime(value: string): string {
  const parsed = parseDateTime(value)
  return parsed ? timeFormat.format(parsed.wallClock) : ''
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** "September 27, 2026" for an account timestamp (UTC), by its UTC day. */
export function formatDate(value: string): string {
  const instant = instantOf(value)
  return Number.isNaN(instant) ? '' : dateFormat.format(new Date(instant))
}

const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/**
 * How long ago an account timestamp (UTC) was, from `now` (epoch ms): "just now", "5 minutes ago", "3 hours ago",
 * "yesterday", "12 days ago"; "on September 1, 2026" beyond a month. A moment ahead of `now` (clocks disagree) is
 * "just now".
 */
export function formatTimeAgo(value: string, now: number): string {
  const instant = instantOf(value)
  if (Number.isNaN(instant)) return ''
  const minutes = Math.floor(Math.max(0, now - instant) / MINUTE_MS)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return relativeFormat.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return relativeFormat.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 30) return relativeFormat.format(-days, 'day')
  return `on ${formatDate(value)}`
}

/** "Sat, Sep 27" for a `YYYY-MM-DD` day. */
export function formatDay(value: string): string {
  return isIsoDate(value) ? dayFormat.format(dateFromIso(value)) : value
}

/** "Saturday, September 27" for a `YYYY-MM-DD` day. */
export function formatLongDay(value: string): string {
  return isIsoDate(value) ? longDayFormat.format(dateFromIso(value)) : value
}

/** "Sat, Sep 27, 7:30 PM" in the cinema's wall-clock time. */
export function formatShowtimeDateTime(value: string): string {
  const parsed = parseDateTime(value)
  return parsed ? `${dayFormat.format(parsed.wallClock)}, ${timeFormat.format(parsed.wallClock)}` : ''
}

/** Parts of a day for a compact date picker: weekday "Sat", day of month "27", month "Sep". */
export function dayParts(value: string): { weekday: string; day: string; month: string } {
  const date = dateFromIso(value)
  return {
    weekday: weekdayFormat.format(date),
    day: String(date.getUTCDate()),
    month: monthFormat.format(date),
  }
}

/** "Today", "Tomorrow", or "Sat, Sep 27", relative to the cinema's `today`. */
export function relativeDayLabel(value: string, today: string): string {
  if (!isIsoDate(value) || !isIsoDate(today)) return formatDay(value)
  const offset = daysBetween(today, value)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return formatDay(value)
}

/** "1 h 58 min", "45 min", "2 h". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * Milliseconds left until `expiresAt`, never negative. `skewMs` is the server clock minus the client clock, so a
 * client whose clock runs fast or slow still counts down to the server's deadline.
 */
export function remainingMs(expiresAt: string, now: number, skewMs = 0): number {
  const deadline = instantOf(expiresAt)
  if (Number.isNaN(deadline)) return 0
  return Math.max(0, deadline - (now + skewMs))
}

/** "12:34" (minutes and seconds, rounded up so the display reaches 0:00 only when time is up). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
