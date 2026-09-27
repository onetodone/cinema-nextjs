import type { MovieRef, Showtime } from '@/lib/api/types'
import { localDateOf } from '@/lib/time'

/** Movies per page on /movies (a multiple of the 2-, 3-, and 4-column grids). */
export const MOVIES_PAGE_SIZE = 24

/** The date strip on /schedule: today and the next 13 days, like the movie page's two-week window. */
export const SCHEDULE_DAYS = 14

const ID_PATTERN = /^[1-9]\d{0,15}$/

/**
 * A catalog id from a URL segment: a positive integer without leading zeros. Anything else is not an id the API
 * could know, so the page can answer "not found" without asking it.
 */
export function parseId(value: string): number | null {
  if (!ID_PATTERN.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

/** A /schedule URL; today (no date) and all movies (no movie) are left out of the query. */
export function scheduleHref({ date, movieId }: { date?: string; movieId?: number | null }): string {
  const query = new URLSearchParams()
  if (date) query.set('date', date)
  if (movieId) query.set('movie', String(movieId))
  const search = query.toString()
  return search ? `/schedule?${search}` : '/schedule'
}

export interface ShowtimeDay {
  /** The cinema's calendar day, `YYYY-MM-DD`. */
  date: string
  showtimes: Showtime[]
}

/** Groups showtimes (already ordered by start) by the cinema's calendar day, keeping the order. */
export function groupShowtimesByDay(showtimes: Showtime[]): ShowtimeDay[] {
  const days: ShowtimeDay[] = []
  for (const showtime of showtimes) {
    const date = localDateOf(showtime.starts_at)
    const last = days.at(-1)
    if (last?.date === date) last.showtimes.push(showtime)
    else days.push({ date, showtimes: [showtime] })
  }
  return days
}

export interface MovieShowtimes {
  movie: MovieRef
  showtimes: Showtime[]
}

/** Groups showtimes (already ordered by start) by movie; movies appear in the order of their first showtime. */
export function groupShowtimesByMovie(showtimes: Showtime[]): MovieShowtimes[] {
  const groups = new Map<number, MovieShowtimes>()
  for (const showtime of showtimes) {
    const group = groups.get(showtime.movie.id)
    if (group) group.showtimes.push(showtime)
    else groups.set(showtime.movie.id, { movie: showtime.movie, showtimes: [showtime] })
  }
  return [...groups.values()]
}

export type Availability = { tone: 'sold-out' | 'low' | 'open'; label: string }

/** A short availability hint for a showtime; "low" below a quarter of the hall. */
export function availabilityOf(showtime: Pick<Showtime, 'seats_available' | 'seats_total'>): Availability {
  const { seats_available: available, seats_total: total } = showtime
  if (available <= 0) return { tone: 'sold-out', label: 'Sold out' }
  if (available * 4 < total) return { tone: 'low', label: `${available} ${available === 1 ? 'seat' : 'seats'} left` }
  return { tone: 'open', label: `${available} seats` }
}
