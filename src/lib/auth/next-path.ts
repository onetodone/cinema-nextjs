// `?next=` carries where to go after signing in. It comes from the URL, so anyone can craft it: only paths of this
// site are followed (no other origin, no `javascript:`), never the API proxy, and never the auth pages themselves.

const AUTH_PAGES = new Set(['/login', '/register'])
const BASE = 'http://next.invalid'

/** The `next` value as a same-site path (`/path?query#hash`), or null when it is missing or not safe to follow. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  let url: URL
  try {
    url = new URL(value, BASE)
  } catch {
    return null
  }
  // The URL parser drops tabs and newlines and turns backslashes into slashes, so re-check the origin it resolved.
  if (url.origin !== BASE) return null
  if (url.pathname === '/v1' || url.pathname.startsWith('/v1/') || AUTH_PAGES.has(url.pathname)) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** The sign-in page, coming back to `next` afterwards (when it is worth coming back to). */
export function loginHref(next?: string | null): string {
  const path = safeNextPath(next)
  return path && path !== '/' ? `/login?next=${encodeURIComponent(path)}` : '/login'
}
