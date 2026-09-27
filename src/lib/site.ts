export const APP_NAME = 'Cinema'

export const APP_DESCRIPTION = 'Browse movies and showtimes, pick your seats on a live seat map, and book tickets.'

/** The public base URL of this app (metadataBase, canonical and Open Graph URLs, the sitemap). */
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/+$/, '')
