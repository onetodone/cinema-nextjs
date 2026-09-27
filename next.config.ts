import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'
const selfHosted = !process.env.VERCEL

const DEFAULT_API_ORIGIN = 'http://localhost:8080'

if (process.env.NODE_ENV === 'production' && !process.env.API_ORIGIN) {
  console.warn(`[next.config] API_ORIGIN is not set — the /v1 proxy will fall back to ${DEFAULT_API_ORIGIN}`)
}

// Server-only. Read when the config loads: `next build` bakes it into the rewrites, so build with the target value.
const apiOrigin = (process.env.API_ORIGIN ?? DEFAULT_API_ORIGIN).replace(/\/+$/, '')

// A static policy (no nonces): nonces force every page to render per request, which rules out the prerendered
// shells of Cache Components. `connect-src 'self'` also guards against browser code calling the API origin directly —
// every API call must go through the same-origin /v1 proxy. Posters come from arbitrary https hosts.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
]

const standaloneConfig: NextConfig = selfHosted
  ? {
      output: 'standalone',
      outputFileTracingIncludes: {
        '/**/*': ['./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*'],
      },
    }
  : {}

const nextConfig: NextConfig = {
  ...standaloneConfig,
  poweredByHeader: false,
  cacheComponents: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  async rewrites() {
    // Browser paths equal API paths, so the refresh cookie's `Path=/v1/auth` matches without extra config.
    // No page route may start with /v1.
    return [{ source: '/v1/:path*', destination: `${apiOrigin}/v1/:path*` }]
  },
}

export default nextConfig
