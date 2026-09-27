// A readable, non-secret "someone is signed in here" hint. The refresh cookie is HttpOnly and scoped to /v1/auth, so
// scripts cannot tell whether it exists; without the hint, every guest page load would spend a refresh call to learn
// that it does not. The hint is never trusted for anything: the API decides.
//
// Its value is the expiry (epoch ms, this machine's clock) of the newest access token a tab got from the API. A tab
// that waited for the refresh lock compares it with what it saw before waiting, to tell that a peer has just
// refreshed and that the new token is on its way over the broadcast channel.

const NAME = 'cinema_signed_in'
// As long as the refresh cookie's idle lifetime (REFRESH_TOKEN_TTL, 7 days); every refresh writes it again.
const MAX_AGE_S = 7 * 24 * 60 * 60

function secureAttribute(): string {
  return window.location.protocol === 'https:' ? '; Secure' : ''
}

/** The hint's value: the newest token's expiry, or null when nobody is signed in (or outside a browser). */
export function readSignedInHint(): number | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [name, value] = part.trim().split('=')
    if (name !== NAME) continue
    const expiresAt = Number(value)
    // An old or hand-made value still counts as "signed in", just without a known expiry.
    return Number.isFinite(expiresAt) ? expiresAt : 0
  }
  return null
}

export function writeSignedInHint(expiresAt: number): void {
  document.cookie = `${NAME}=${Math.round(expiresAt)}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secureAttribute()}`
}

export function clearSignedInHint(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${NAME}=; Path=/; Max-Age=0; SameSite=Lax${secureAttribute()}`
}
