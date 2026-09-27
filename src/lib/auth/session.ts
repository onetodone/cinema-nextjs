import { ApiError } from '@/lib/api/errors'
import { networkError, toApiError, unwrap } from '@/lib/api/problem'
import { publicApi } from '@/lib/api/public'
import type { TokenResponse, User } from '@/lib/api/types'
import { postAuthMessage, subscribeAuthMessages, type AuthMessage, type SignOutReason } from '@/lib/auth/broadcast'
import { clearSignedInHint, readSignedInHint, writeSignedInHint } from '@/lib/auth/hint-cookie'
import { withAuthLock } from '@/lib/auth/lock'
import { getAccessToken, setAccessToken, type AccessToken } from '@/lib/auth/token-store'

// The browser session: one access token per tab, kept fresh with the HttpOnly refresh cookie, and shared by every tab
// of this origin. The refresh path is load-bearing — a hole in it causes refresh storms, rate-limit lockouts, or
// spurious sign-outs — so its rules are:
//
// - A tab boots once. Without the hint cookie it is a guest and makes no auth call. With it, the tab asks its peers
//   for their token (`hello`) and refreshes by itself only when nobody answers.
// - Refreshes are single-flight per tab, and serialised across tabs by the auth lock. Under the lock a tab first
//   checks whether a peer has refreshed meanwhile, so N tabs whose tokens expire together make one request.
// - Only a 401 from the refresh endpoint ends the session. A network error, a 5xx, or a 429 after its retries keeps
//   the session: the caller sees the error, and the next request, focus, or timer tries again.
// - Work that started before the session ended (or its user changed) never applies after it: `epoch` tells.
//
// The module is imported during server rendering too; everything that touches the browser runs from `ensureBooted`
// (an effect) or from user actions.

export type { SignOutReason }

/** How long a starting tab waits for a peer to hand over its token before refreshing by itself. */
const HELLO_WAIT_MS = 150
/** How long a tab that sees a peer's refresh in the hint cookie waits for that token to arrive over the channel. */
const PEER_TOKEN_WAIT_MS = 1_000
/** Auth requests hold the lock, so none may hang: after this long they count as a network failure. */
const REQUEST_TIMEOUT_MS = 15_000
/** A token is refreshed this long before it expires, or a quarter of its lifetime before for short-lived tokens. */
const MAX_REFRESH_LEAD_MS = 60_000
/** When a tab regains focus, a token with less than this left (or half its lifetime, if shorter) is refreshed. */
const FOCUS_REFRESH_WINDOW_MS = 120_000
/** A token with less than this left is not sent: it could expire on the way. */
const MIN_USABLE_MS = 5_000
/** A refresh answered 429 is tried again this many times, after its Retry-After (capped). */
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RETRY_WAIT_S = 5

/**
 * `loading` until the tab knows; `error` when the start-up check got no usable answer (network, 5xx), so whether
 * someone is signed in is unknown — it is retried on focus, when the browser goes online, and on demand.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

export interface SessionSnapshot {
  status: AuthStatus
  user: User | null
}

export interface SignedOutEvent {
  reason: SignOutReason
  /** The session ended in another tab. */
  remote: boolean
}

const SERVER_SNAPSHOT: SessionSnapshot = { status: 'loading', user: null }

let snapshot: SessionSnapshot = SERVER_SNAPSHOT
/** Changes whenever the session ends or its user changes; results of work started under an older epoch are dropped. */
let epoch = 0
/** When the session last ended (epoch ms): a token issued before then belongs to an ended session. */
let signedOutAt = 0
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let refreshing: Promise<string> | null = null
let booting: Promise<void> | null = null

const snapshotListeners = new Set<() => void>()
const signedOutListeners = new Set<(event: SignedOutEvent) => void>()
const userChangeListeners = new Set<() => void>()
/** Internal: checks waiting for this tab to get a token (or to lose its session). */
const stateWaiters = new Set<() => void>()

// --- Store (for useSyncExternalStore) and events ---

export function subscribeSession(listener: () => void): () => void {
  snapshotListeners.add(listener)
  return () => snapshotListeners.delete(listener)
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot
}

export function getServerSessionSnapshot(): SessionSnapshot {
  return SERVER_SNAPSHOT
}

/** Called when a session this tab held ends: here or in another tab, on purpose or refused by the API. */
export function onSignedOut(listener: (event: SignedOutEvent) => void): () => void {
  signedOutListeners.add(listener)
  return () => signedOutListeners.delete(listener)
}

/**
 * Called synchronously whenever the signed-in user changes — a sign-out, or another account signing in — before
 * the UI sees the new user, so personal data can be dropped first.
 */
export function onUserChange(listener: () => void): () => void {
  userChangeListeners.add(listener)
  return () => userChangeListeners.delete(listener)
}

function setSnapshot(status: AuthStatus, user: User | null): void {
  // A refresh answers with the same account every time: keep the old object, so nothing re-renders for it.
  const sameUser =
    user !== null &&
    snapshot.user !== null &&
    user.id === snapshot.user.id &&
    user.email === snapshot.user.email &&
    user.role === snapshot.user.role
  const nextUser = sameUser ? snapshot.user : user
  if (snapshot.status === status && snapshot.user === nextUser) return
  snapshot = { status, user: nextUser }
  snapshotListeners.forEach((notify) => notify())
}

// --- Tokens ---

function msLeft(token: AccessToken): number {
  return token.expiresAt - Date.now()
}

/** How long before its expiry a token is due for a refresh. */
function refreshLead(token: AccessToken): number {
  return Math.min(MAX_REFRESH_LEAD_MS, token.lifetimeMs / 4)
}

function isFresh(token: AccessToken): boolean {
  return msLeft(token) > refreshLead(token)
}

function notSignedIn(): ApiError {
  return new ApiError('You are not signed in.', { status: 401, code: 'UNAUTHENTICATED' })
}

function timeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

function isTokenResponse(value: unknown): value is TokenResponse {
  if (typeof value !== 'object' || value === null) return false
  const body = value as Partial<TokenResponse>
  return (
    typeof body.access_token === 'string' &&
    typeof body.expires_in === 'number' &&
    body.expires_in > 0 &&
    typeof body.user?.id === 'string' &&
    typeof body.user.email === 'string'
  )
}

/** Makes `token` this tab's token for `user`, and schedules its refresh. */
function adopt(token: AccessToken, user: User): void {
  if (snapshot.user?.id !== user.id) {
    epoch += 1
    userChangeListeners.forEach((notify) => notify())
  }
  setAccessToken(token)
  scheduleRefresh(token)
  setSnapshot('authenticated', user)
  stateWaiters.forEach((check) => check())
}

/** Takes a login or refresh answer: adopts its token, marks the hint cookie, and hands the token to the other tabs. */
function adoptResponse(body: TokenResponse): AccessToken {
  const lifetimeMs = body.expires_in * 1000
  const token: AccessToken = { value: body.access_token, expiresAt: Date.now() + lifetimeMs, lifetimeMs }
  adopt(token, body.user)
  writeSignedInHint(token.expiresAt)
  postAuthMessage({ type: 'session', token, user: body.user })
  return token
}

/** Forgets the session in this tab. A local end is announced to the other tabs; a remote one came from them. */
function endSession(reason: SignOutReason, remote: false): void
function endSession(reason: SignOutReason, remote: true, at: number): void
function endSession(reason: SignOutReason, remote: boolean, at = Date.now()): void {
  const wasSignedIn = snapshot.status === 'authenticated'
  epoch += 1
  signedOutAt = Math.max(signedOutAt, at)
  setAccessToken(null)
  clearTimeout(refreshTimer)
  // The tab that ended the session cleared the hint; clearing it again here could erase a newer sign-in's hint.
  if (!remote) clearSignedInHint()
  if (snapshot.user) userChangeListeners.forEach((notify) => notify())
  setSnapshot('unauthenticated', null)
  stateWaiters.forEach((check) => check())
  if (!remote) postAuthMessage({ type: 'signed-out', reason, at })
  if (wasSignedIn) signedOutListeners.forEach((notify) => notify({ reason, remote }))
}

function scheduleRefresh(token: AccessToken): void {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(
    () => {
      // A failure keeps the session: the next request, focus, or reconnect tries again.
      void refreshAccessToken(token.value).catch(() => {})
    },
    Math.max(0, msLeft(token) - refreshLead(token)),
  )
}

/**
 * Resolves true as soon as this tab holds a fresh token that expires after `newerThan` (epoch ms), false when the
 * session ends meanwhile or after `ms`.
 */
function waitForToken(ms: number, newerThan: number): Promise<boolean> {
  const startEpoch = epoch
  return new Promise((resolve) => {
    const settle = (adopted: boolean) => {
      clearTimeout(timer)
      stateWaiters.delete(check)
      resolve(adopted)
    }
    const check = () => {
      const token = getAccessToken()
      if (token && token.expiresAt > newerThan && isFresh(token)) settle(true)
      else if (epoch !== startEpoch) settle(false)
    }
    const timer = setTimeout(() => settle(false), ms)
    stateWaiters.add(check)
    check()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Refresh ---

/**
 * Gets a new access token with the refresh cookie and returns it. `staleToken` is the token the caller found
 * wanting (expired, refused, or due): if this tab's token has changed from it and is fresh, that one is returned
 * without a request. Calls made while one is in flight share it.
 *
 * Rejects with an ApiError: 401 when the session is over (the tab is then signed out), `NETWORK` or another status
 * when the API gave no usable answer (the session is kept).
 */
export function refreshAccessToken(staleToken: string | null): Promise<string> {
  if (!refreshing) {
    const startEpoch = epoch
    const hintBefore = readSignedInHint()
    refreshing = withAuthLock(() => refreshUnderLock(staleToken, startEpoch, hintBefore)).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

async function refreshUnderLock(
  staleToken: string | null,
  startEpoch: number,
  hintBefore: number | null,
): Promise<string> {
  const current = getAccessToken()
  // A peer (or an earlier call here) refreshed while this call waited for the lock, and its token has arrived.
  if (current && current.value !== staleToken && isFresh(current)) return current.value
  if (epoch !== startEpoch && !current) throw notSignedIn()

  // A peer refreshed while this call waited (it rewrote the hint), but its token is still on the way: the channel
  // and the lock are separate, so the message can arrive after the lock. Waiting saves a second refresh.
  const hint = readSignedInHint()
  if (hint !== null && hint !== hintBefore && hint - Date.now() > MIN_USABLE_MS) {
    if (await waitForToken(PEER_TOKEN_WAIT_MS, current?.expiresAt ?? 0)) return getAccessToken()!.value
  }

  for (let attempt = 0; ; attempt += 1) {
    const requestEpoch = epoch
    let result
    try {
      result = await publicApi.POST('/v1/auth/refresh', { body: {}, signal: timeout() })
    } catch (cause) {
      throw networkError(cause)
    }
    const { data, error, response } = result

    if (epoch !== requestEpoch) {
      // Signed out, or another account signed in, while the request was on its way: its answer is stale.
      const token = getAccessToken()
      if (token) return token.value
      throw notSignedIn()
    }
    if (response.ok && isTokenResponse(data)) return adoptResponse(data).value

    const failure = toApiError(response, error)
    if (response.status === 401) {
      // REFRESH_INVALID: no cookie, or its session expired, was revoked, or was reused. The API has cleared it.
      endSession('expired', false)
      throw failure
    }
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep(Math.min(failure.retryAfter ?? 1, MAX_RETRY_WAIT_S) * 1000)
      continue
    }
    throw failure
  }
}

// --- Boot and upkeep ---

function handleMessage(message: AuthMessage): void {
  switch (message?.type) {
    case 'hello': {
      const token = getAccessToken()
      if (snapshot.status === 'authenticated' && snapshot.user && token && msLeft(token) > MIN_USABLE_MS) {
        postAuthMessage({ type: 'session', token, user: snapshot.user })
      }
      return
    }
    case 'session': {
      const { token, user } = message
      if (typeof token?.value !== 'string' || typeof user?.id !== 'string') return
      // Issued before a sign-out this tab knows of (a late answer to a hello), or about to expire.
      if (token.expiresAt - token.lifetimeMs < signedOutAt || msLeft(token) <= MIN_USABLE_MS) return
      const current = getAccessToken()
      if (current && snapshot.user?.id === user.id && current.expiresAt >= token.expiresAt) return
      adopt(token, user)
      return
    }
    case 'signed-out':
      endSession(message.reason, true, message.at)
      return
  }
}

/**
 * Starts this tab's session once: listens to the other tabs and finds out whether someone is signed in. Safe to call
 * any number of times; resolves when the tab knows.
 */
export function ensureBooted(): Promise<void> {
  booting ??= boot()
  return booting
}

async function boot(): Promise<void> {
  subscribeAuthMessages(handleMessage)

  if (readSignedInHint() === null) {
    setSnapshot('unauthenticated', null)
    return
  }
  postAuthMessage({ type: 'hello' })
  if (await waitForToken(HELLO_WAIT_MS, 0)) return
  // A sign-in or sign-out reached this tab meanwhile.
  if (snapshot.status !== 'loading') return

  try {
    await refreshAccessToken(null)
  } catch {
    // A 401 has signed the tab out already; anything else leaves the answer unknown.
    if (snapshot.status === 'loading') setSnapshot('error', null)
  }
}

/**
 * Tries the start-up check again after it got no usable answer (status `error`). With `visibly`, the tab shows the
 * loading state meanwhile (a "Try again" button); otherwise it stays as it is until the answer arrives.
 */
export function retrySession({ visibly = false }: { visibly?: boolean } = {}): void {
  if (snapshot.status !== 'error') return
  if (visibly) setSnapshot('loading', null)
  void refreshAccessToken(null).catch(() => {
    if (snapshot.status === 'loading') setSnapshot('error', null)
  })
}

/** For focus, visibility, and reconnects: background tabs' timers are throttled, so catch up here. */
export function refreshIfStale(): void {
  if (snapshot.status === 'error') {
    retrySession()
    return
  }
  if (snapshot.status !== 'authenticated') return
  const current = getAccessToken()
  if (current && msLeft(current) > Math.min(FOCUS_REFRESH_WINDOW_MS, current.lifetimeMs / 2)) return
  void refreshAccessToken(current?.value ?? null).catch(() => {})
}

/**
 * A token to send now: this tab's, or a refreshed one when it has none or it is about to expire. Rejects with a 401
 * ApiError when nobody is signed in, and as `refreshAccessToken` does otherwise.
 */
export async function getValidAccessToken(): Promise<string> {
  await ensureBooted()
  const current = getAccessToken()
  if (current && msLeft(current) > MIN_USABLE_MS) return current.value
  if (snapshot.status === 'unauthenticated') throw notSignedIn()
  return refreshAccessToken(current?.value ?? null)
}

/** The API refused a token that was just refreshed: the session has been revoked. */
export function expireSession(): void {
  if (snapshot.status === 'authenticated') endSession('expired', false)
}

// --- Account actions ---

/** Signs in and shares the session with the other tabs. Rejects with an ApiError (`INVALID_CREDENTIALS`, 429, …). */
export async function signIn(email: string, password: string): Promise<void> {
  await withAuthLock(async () => {
    const body = await unwrap(publicApi.POST('/v1/auth/login', { body: { email, password }, signal: timeout() }))
    if (!isTokenResponse(body))
      throw new ApiError('Unexpected answer to the sign-in.', { status: 200, code: 'UNEXPECTED_RESPONSE' })
    adoptResponse(body)
  })
}

/** Creates an account. It starts no session: sign in next. */
export async function registerAccount(email: string, password: string): Promise<void> {
  await unwrap(publicApi.POST('/v1/auth/register', { body: { email, password }, signal: timeout() }))
}

/**
 * Signs out every tab at once, then ends the session on the server (best effort: without an answer it expires by
 * itself). The request survives the page closing.
 */
export async function signOut(): Promise<void> {
  endSession('logout', false)
  await withAuthLock(async () => {
    try {
      await publicApi.POST('/v1/auth/logout', { body: {}, keepalive: true, signal: timeout() })
    } catch {
      // The session stays on the server until it expires; this browser no longer uses it.
    }
  })
}

/** Ends every session of the account, on every device. Rejects with an ApiError, keeping this session, if that fails. */
export async function signOutEverywhere(): Promise<void> {
  const token = await getValidAccessToken()
  await withAuthLock(async () => {
    let result
    try {
      result = await publicApi.POST('/v1/auth/logout-all', {
        headers: { Authorization: `Bearer ${token}` },
        signal: timeout(),
      })
    } catch (cause) {
      throw networkError(cause)
    }
    // A 401 means this session had already ended: there is nothing left to sign out of.
    if (!result.response.ok && result.response.status !== 401) throw toApiError(result.response, result.error)
    endSession('logout', false)
  })
}
