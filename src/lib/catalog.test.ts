import { describe, expect, it } from 'vitest'
import type { Showtime } from '@/lib/api/types'
import { availabilityOf, groupShowtimesByDay, groupShowtimesByMovie, parseId, scheduleHref } from '@/lib/catalog'

function showtime(id: number, movieId: number, startsAt: string): Showtime {
  return {
    id,
    movie: { id: movieId, title: `Movie ${movieId}`, duration_min: 100 },
    hall: { id: 1, name: 'Hall 1' },
    starts_at: startsAt,
    ends_at: startsAt,
    status: 'scheduled',
    base_price_cents: 1100,
    currency: 'USD',
    seats_available: 10,
    seats_total: 10,
  }
}

describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('1')).toBe(1)
    expect(parseId('9007199254740991')).toBe(9007199254740991)
    for (const value of ['0', '-1', '01', '1.5', '1e3', 'abc', '', ' 1', '99999999999999999']) {
      expect(parseId(value), value).toBeNull()
    }
  })
})

describe('grouping showtimes', () => {
  const items = [
    showtime(1, 10, '2026-09-27T10:00:00+02:00'),
    showtime(2, 20, '2026-09-27T12:00:00+02:00'),
    showtime(3, 10, '2026-09-27T23:30:00+02:00'),
    // Past midnight in the cinema's zone, although still Sep 27 in UTC.
    showtime(4, 20, '2026-09-28T00:30:00+02:00'),
  ]

  it('groups by the cinema calendar day, keeping the order', () => {
    const days = groupShowtimesByDay(items)

    expect(days.map((day) => [day.date, day.showtimes.map((item) => item.id)])).toEqual([
      ['2026-09-27', [1, 2, 3]],
      ['2026-09-28', [4]],
    ])
  })

  it('groups by movie in the order of first showtimes', () => {
    const movies = groupShowtimesByMovie(items)

    expect(movies.map((group) => [group.movie.id, group.showtimes.map((item) => item.id)])).toEqual([
      [10, [1, 3]],
      [20, [2, 4]],
    ])
  })
})

describe('availabilityOf', () => {
  it('flags sold-out and nearly full showtimes', () => {
    expect(availabilityOf({ seats_available: 0, seats_total: 40 })).toEqual({ tone: 'sold-out', label: 'Sold out' })
    expect(availabilityOf({ seats_available: 1, seats_total: 40 })).toEqual({ tone: 'low', label: '1 seat left' })
    expect(availabilityOf({ seats_available: 9, seats_total: 40 })).toEqual({ tone: 'low', label: '9 seats left' })
    expect(availabilityOf({ seats_available: 10, seats_total: 40 })).toEqual({ tone: 'open', label: '10 seats' })
  })
})

describe('scheduleHref', () => {
  it('leaves today and all movies out of the query', () => {
    expect(scheduleHref({})).toBe('/schedule')
    expect(scheduleHref({ date: '2026-09-28' })).toBe('/schedule?date=2026-09-28')
    expect(scheduleHref({ movieId: 3 })).toBe('/schedule?movie=3')
    expect(scheduleHref({ date: '2026-09-28', movieId: 3 })).toBe('/schedule?date=2026-09-28&movie=3')
    expect(scheduleHref({ date: undefined, movieId: null })).toBe('/schedule')
  })
})
