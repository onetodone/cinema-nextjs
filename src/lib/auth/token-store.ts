// The access token lives here, in this tab's memory only: never in localStorage, sessionStorage, a cookie, or the
// RSC payload. A reload drops it; the session module gets a new one from a peer tab or with the refresh cookie.

export interface AccessToken {
  /** The JWT sent as `Authorization: Bearer …`. */
  value: string
  /**
   * When it expires, in epoch milliseconds by this machine's clock: the moment it arrived plus the API's
   * `expires_in`. Computed locally rather than read from the JWT's `exp`, so a client clock that is off does not
   * matter. Tabs share it as is (they share the clock).
   */
  expiresAt: number
  /** Its whole lifetime (`expires_in`), in milliseconds. */
  lifetimeMs: number
}

let current: AccessToken | null = null

export function getAccessToken(): AccessToken | null {
  return current
}

export function setAccessToken(token: AccessToken | null): void {
  current = token
}
