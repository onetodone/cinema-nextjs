import type { MetadataRoute } from 'next'
import { APP_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The API proxy and personal pages (they render nothing without a session anyway).
        disallow: ['/v1/', '/checkout/', '/bookings', '/account', '/login', '/register'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
