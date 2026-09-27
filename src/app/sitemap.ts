import type { MetadataRoute } from 'next'
import { connection } from 'next/server'
import { getMoviesPage } from '@/lib/api/server'
import { logger } from '@/lib/logger'
import { APP_URL } from '@/lib/site'

// Enough for any real catalog (100 movies per page); a guard against a cursor loop, not a product limit.
const MAX_PAGES = 50

/**
 * The public pages worth indexing: home, movies, the schedule, and every movie. Showtimes are left out (they
 * expire within days and are `noindex`). Built per request from the catalog cache; without the API it still lists
 * the fixed pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Request time only, and outside the try below: during `next build` this never resolves, and a catch must not
  // swallow the signal that ends the prerender.
  await connection()

  const entries: MetadataRoute.Sitemap = [
    { url: `${APP_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${APP_URL}/movies`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${APP_URL}/schedule`, changeFrequency: 'hourly', priority: 0.8 },
  ]

  let cursor: string | undefined
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items, next_cursor } = await getMoviesPage(cursor, 100)
      for (const movie of items) {
        entries.push({ url: `${APP_URL}/movies/${movie.id}`, changeFrequency: 'weekly', priority: 0.6 })
      }
      cursor = next_cursor
      if (!cursor) break
    }
  } catch (error) {
    logger.warn('sitemap.movies_unavailable', { error })
  }
  return entries
}
