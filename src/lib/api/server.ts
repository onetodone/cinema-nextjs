import 'server-only'

import { cacheLife } from 'next/cache'
import { connection } from 'next/server'
import createClient from 'openapi-fetch'
import type { paths } from '@/lib/api/schema'
import type { MovieDetails, MovieList, Schedule, SeatMap, Showtime } from '@/lib/api/types'
import { unwrap, unwrapOrNull } from '@/lib/api/problem'
import { MOVIES_PAGE_SIZE } from '@/lib/catalog'
import { logger } from '@/lib/logger'

// Public catalog reads for Server Components. Nothing personal ever goes through here: the access token lives only
// in the browser, so this client never sends credentials.
//
// Every read waits for `connection()` first, so it runs at request time only: `next build` (and CI, which has no
// API) never calls the API, and pages stream their catalog data into a prerendered shell. Behind that, the reads
// are cached in this server's memory (`use cache`) with the `catalog` and `schedule` profiles from next.config.ts.
// Call them inside a Suspense boundary.

const DEFAULT_API_ORIGIN = 'http://localhost:8080'
const REQUEST_TIMEOUT_MS = 10_000

const apiOrigin = (process.env.API_ORIGIN ?? DEFAULT_API_ORIGIN).replace(/\/+$/, '')

const api = createClient<paths>({
  baseUrl: apiOrigin,
  // A hung API must not hold a render open: the section's error boundary takes over instead.
  fetch: (request) => fetch(request, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
})

/** One page of movies, by id. */
export async function getMoviesPage(cursor?: string, limit = MOVIES_PAGE_SIZE): Promise<MovieList> {
  await connection()
  return cachedMoviesPage(cursor, limit)
}

async function cachedMoviesPage(cursor: string | undefined, limit: number): Promise<MovieList> {
  'use cache'
  cacheLife('catalog')
  return unwrap(api.GET('/v1/movies', { params: { query: { cursor, limit } } }))
}

/** A movie with its showtimes in the next two weeks, or null when it does not exist. */
export async function getMovie(id: number): Promise<MovieDetails | null> {
  await connection()
  return cachedMovie(id)
}

async function cachedMovie(id: number): Promise<MovieDetails | null> {
  'use cache'
  cacheLife('catalog')
  return unwrapOrNull(api.GET('/v1/movies/{movieID}', { params: { path: { movieID: id } } }))
}

/**
 * The schedule of one day in the cinema's time zone; without a date, today's. The whole day is cached once and
 * filtered by movie in the page, so every filter of a day shares one entry (the API caches it the same way).
 */
export async function getSchedule(date?: string): Promise<Schedule> {
  await connection()
  return cachedSchedule(date)
}

async function cachedSchedule(date: string | undefined): Promise<Schedule> {
  'use cache'
  cacheLife('schedule')
  return unwrap(api.GET('/v1/showtimes', { params: { query: { date } } }))
}

/**
 * The cinema's current date (`YYYY-MM-DD`), which the API reports with today's schedule; null when it cannot be
 * read, so pages that only use it for "Today"/"Tomorrow" labels still render.
 */
export async function getCinemaToday(): Promise<string | null> {
  await connection()
  try {
    return (await cachedSchedule(undefined)).date
  } catch (error) {
    logger.warn('catalog.today_unavailable', { error })
    return null
  }
}

/** A showtime in any status (canceled included), or null when it does not exist. */
export async function getShowtime(id: number): Promise<Showtime | null> {
  await connection()
  return cachedShowtime(id)
}

async function cachedShowtime(id: number): Promise<Showtime | null> {
  'use cache'
  cacheLife('schedule')
  return unwrapOrNull(api.GET('/v1/showtimes/{showtimeID}', { params: { path: { showtimeID: id } } }))
}

/** A seat map and the moment it was read (epoch ms). */
export interface SeatMapSnapshot {
  seatMap: SeatMap
  fetchedAt: number
}

/** The seat map as it is now, never cached here: it seeds the client, which polls it from then on. */
export async function getSeatMapSnapshot(id: number): Promise<SeatMapSnapshot | null> {
  await connection()
  const seatMap = await unwrapOrNull(
    api.GET('/v1/showtimes/{showtimeID}/seats', { params: { path: { showtimeID: id } } }),
  )
  return seatMap ? { seatMap, fetchedAt: Date.now() } : null
}
