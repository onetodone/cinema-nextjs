import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANN,
  BOB,
  FakeBroadcastChannel,
  clearCookies,
  deferred,
  fakeApi,
  installLocks,
  problem,
  tokenResponse,
  uninstallLocks,
} from '@/test/auth'

type Session = typeof import('@/lib/auth/session')

/** A new tab: a fresh copy of the session modules, sharing the channel, the locks, the cookies, and the API. */
async function openTab(): Promise<Session> {
  vi.resetModules()
  return import('@/lib/auth/session')
}

/** A tab that booted as a guest and then signed in with the form. */
async function signedInTab(): Promise<Session> {
  const tab = await openTab()
  await tab.ensureBooted()
  await tab.signIn(ANN.email, 'secret-password')
  return tab
}

function hintValue(): string | undefined {
  return document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('cinema_signed_in='))
    ?.split('=')[1]
}

function useApi(routes: Parameters<typeof fakeApi>[0] = {}) {
  const api = fakeApi(routes)
  vi.stubGlobal('fetch', api.fetch)
  return api
}

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  installLocks()
  clearCookies()
})

afterEach(() => {
  vi.useRealTimers()
  uninstallLocks()
})

describe('boot', () => {
  it('makes no auth call for a guest (no hint cookie)', async () => {
    const api = useApi()
    const tab = await openTab()

    await tab.ensureBooted()

    expect(tab.getSessionSnapshot()).toEqual({ status: 'unauthenticated', user: null })
    expect(api.fetch).not.toHaveBeenCalled()
  })

  it('refreshes once with the hint cookie when no tab answers, and shares nothing but the hint', async () => {
    document.cookie = 'cinema_signed_in=1; Path=/'
    const api = useApi()
    const tab = await openTab()

    await tab.ensureBooted()

    expect(tab.getSessionSnapshot()).toEqual({ status: 'authenticated', user: ANN })
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
    const [request] = api.requests
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(await request.text()).toBe('{}')
    // The hint now carries the new token's expiry.
    expect(Number(hintValue())).toBeGreaterThan(Date.now() + 800_000)
    expect(document.cookie).not.toContain('refreshed-1')
  })

  it('becomes a guest quietly when the refresh cookie is no good', async () => {
    document.cookie = 'cinema_signed_in=1; Path=/'
    useApi({ 'POST /v1/auth/refresh': () => problem(401, 'REFRESH_INVALID') })
    const tab = await openTab()
    const signedOut = vi.fn()
    tab.onSignedOut(signedOut)

    await tab.ensureBooted()

    expect(tab.getSessionSnapshot()).toEqual({ status: 'unauthenticated', user: null })
    expect(hintValue()).toBeUndefined()
    expect(signedOut).not.toHaveBeenCalled()
  })

  it('reports an unknown state when the API cannot be reached, and recovers on retry', async () => {
    document.cookie = 'cinema_signed_in=1; Path=/'
    const api = useApi({
      'POST /v1/auth/refresh': (_request, call) => {
        if (call === 1) throw new TypeError('fetch failed')
        return tokenResponse('refreshed-2')
      },
    })
    const tab = await openTab()

    await tab.ensureBooted()
    expect(tab.getSessionSnapshot().status).toBe('error')
    expect(hintValue()).toBe('1')

    tab.retrySession({ visibly: true })
    expect(tab.getSessionSnapshot().status).toBe('loading')
    await vi.waitFor(() => expect(tab.getSessionSnapshot().status).toBe('authenticated'))
    expect(api.count('POST /v1/auth/refresh')).toBe(2)
  })

  it('takes the token of a signed-in tab instead of refreshing', async () => {
    const api = useApi()
    const first = await signedInTab()
    const second = await openTab()

    await second.ensureBooted()

    expect(second.getSessionSnapshot()).toEqual({ status: 'authenticated', user: ANN })
    await expect(second.getValidAccessToken()).resolves.toBe('login-1')
    expect(api.count('POST /v1/auth/refresh')).toBe(0)
    expect(first.getSessionSnapshot().status).toBe('authenticated')
  })
})

describe('refresh', () => {
  it('shares one request between concurrent calls in a tab', async () => {
    const api = useApi()
    const tab = await signedInTab()

    const tokens = await Promise.all([
      tab.refreshAccessToken('login-1'),
      tab.refreshAccessToken('login-1'),
      tab.refreshAccessToken(null),
    ])

    expect(tokens).toEqual(['refreshed-2', 'refreshed-2', 'refreshed-2'])
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
  })

  it('makes one request when the tokens of N tabs are due at once', async () => {
    const api = useApi()
    const tabs = [await signedInTab()]
    for (let i = 0; i < 2; i++) {
      const tab = await openTab()
      await tab.ensureBooted()
      tabs.push(tab)
    }

    const tokens = await Promise.all(tabs.map((tab) => tab.refreshAccessToken('login-1')))

    expect(tokens).toEqual(['refreshed-2', 'refreshed-2', 'refreshed-2'])
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
  })

  it('makes one request even when the new token reaches a tab after the lock does', async () => {
    const api = useApi()
    const first = await signedInTab()
    const second = await openTab()
    await second.ensureBooted()
    FakeBroadcastChannel.delayMs = 50

    const tokens = await Promise.all([first.refreshAccessToken('login-1'), second.refreshAccessToken('login-1')])

    expect(tokens).toEqual(['refreshed-2', 'refreshed-2'])
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
  })

  it('keeps the session when the refresh gets no answer', async () => {
    useApi({
      'POST /v1/auth/refresh': () => {
        throw new TypeError('fetch failed')
      },
    })
    const tab = await signedInTab()

    await expect(tab.refreshAccessToken('login-1')).rejects.toMatchObject({ code: 'NETWORK' })
    expect(tab.getSessionSnapshot()).toEqual({ status: 'authenticated', user: ANN })
  })

  it('waits out a 429 and tries again', async () => {
    const api = useApi({
      'POST /v1/auth/refresh': (_request, call) =>
        call === 1 ? problem(429, 'RATE_LIMITED', { 'Retry-After': '0' }) : tokenResponse('refreshed-2'),
    })
    const tab = await signedInTab()

    await expect(tab.refreshAccessToken('login-1')).resolves.toBe('refreshed-2')
    expect(api.count('POST /v1/auth/refresh')).toBe(2)
  })

  it('gives up after two retries of a 429, keeping the session', async () => {
    const api = useApi({ 'POST /v1/auth/refresh': () => problem(429, 'RATE_LIMITED', { 'Retry-After': '0' }) })
    const tab = await signedInTab()

    await expect(tab.refreshAccessToken('login-1')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
    expect(api.count('POST /v1/auth/refresh')).toBe(3)
    expect(tab.getSessionSnapshot().status).toBe('authenticated')
  })

  it('signs every tab out when the API refuses the refresh cookie', async () => {
    useApi({ 'POST /v1/auth/refresh': () => problem(401, 'REFRESH_INVALID') })
    const first = await signedInTab()
    const second = await openTab()
    await second.ensureBooted()
    const firstSignedOut = vi.fn()
    const secondSignedOut = vi.fn()
    first.onSignedOut(firstSignedOut)
    second.onSignedOut(secondSignedOut)

    await expect(first.refreshAccessToken('login-1')).rejects.toMatchObject({ status: 401, code: 'REFRESH_INVALID' })

    expect(first.getSessionSnapshot()).toEqual({ status: 'unauthenticated', user: null })
    expect(firstSignedOut).toHaveBeenCalledWith({ reason: 'expired', remote: false })
    expect(hintValue()).toBeUndefined()
    await vi.waitFor(() => expect(second.getSessionSnapshot().status).toBe('unauthenticated'))
    expect(secondSignedOut).toHaveBeenCalledWith({ reason: 'expired', remote: true })
  })

  it('drops an answer that arrives after the user signed out, and logs out after it', async () => {
    const answer = deferred<Response>()
    const api = useApi({ 'POST /v1/auth/refresh': () => answer.promise })
    const tab = await signedInTab()

    const refresh = tab.refreshAccessToken('login-1')
    await vi.waitFor(() => expect(api.count('POST /v1/auth/refresh')).toBe(1))
    const signOut = tab.signOut()
    answer.resolve(tokenResponse('refreshed-2'))

    await expect(refresh).rejects.toMatchObject({ status: 401 })
    await signOut
    expect(tab.getSessionSnapshot()).toEqual({ status: 'unauthenticated', user: null })
    // The logout waited for the refresh, so it carried the newest cookie.
    expect(api.requests.map((request) => new URL(request.url).pathname).slice(-2)).toEqual([
      '/v1/auth/refresh',
      '/v1/auth/logout',
    ])
  })

  it('refreshes by itself shortly before the token expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const api = useApi({ 'POST /v1/auth/login': () => tokenResponse('login-1', { expiresIn: 40 }) })
    const tab = await signedInTab()

    // A quarter of a 40-second lifetime before expiry: at 30 s.
    await vi.advanceTimersByTimeAsync(29_000)
    expect(api.count('POST /v1/auth/refresh')).toBe(0)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
    await expect(tab.getValidAccessToken()).resolves.toBe('refreshed-1')
  })

  it('refreshes on focus only when the token is close to expiring', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const api = useApi({ 'POST /v1/auth/login': () => tokenResponse('login-1', { expiresIn: 60 }) })
    const tab = await signedInTab()

    tab.refreshIfStale()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count('POST /v1/auth/refresh')).toBe(0)

    // Half of the lifetime is left; the timer would fire at 45 s.
    await vi.advanceTimersByTimeAsync(31_000)
    tab.refreshIfStale()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
  })
})

describe('tabs', () => {
  it('a sign-in in one tab reaches the others', async () => {
    useApi()
    const other = await openTab()
    await other.ensureBooted()

    await signedInTab()

    await vi.waitFor(() => expect(other.getSessionSnapshot()).toEqual({ status: 'authenticated', user: ANN }))
    await expect(other.getValidAccessToken()).resolves.toBe('login-1')
  })

  it('a sign-out in one tab signs the others out', async () => {
    const api = useApi()
    const first = await signedInTab()
    const second = await openTab()
    await second.ensureBooted()
    const signedOut = vi.fn()
    second.onSignedOut(signedOut)

    await first.signOut()

    await vi.waitFor(() => expect(second.getSessionSnapshot().status).toBe('unauthenticated'))
    expect(signedOut).toHaveBeenCalledWith({ reason: 'logout', remote: true })
    expect(api.count('POST /v1/auth/logout')).toBe(1)
  })

  it('another account signing in replaces the user, dropping personal data first', async () => {
    useApi({
      'POST /v1/auth/login': (_request, call) => tokenResponse(`login-${call}`, { user: call === 1 ? ANN : BOB }),
    })
    const first = await signedInTab()
    const userChanged = vi.fn(() => expect(first.getSessionSnapshot().user).toEqual(ANN))
    first.onUserChange(userChanged)

    const second = await openTab()
    await second.ensureBooted()
    await second.signIn(BOB.email, 'secret-password')

    await vi.waitFor(() => expect(first.getSessionSnapshot().user).toEqual(BOB))
    expect(userChanged).toHaveBeenCalledTimes(1)
    await expect(first.getValidAccessToken()).resolves.toBe('login-2')
  })

  it('ignores a token issued before a sign-out it has heard of (a late answer to a hello)', async () => {
    useApi()
    const tab = await openTab()
    await tab.ensureBooted()
    const peer = new FakeBroadcastChannel('cinema-auth')
    const now = Date.now()

    peer.postMessage({ type: 'signed-out', reason: 'logout', at: now })
    peer.postMessage({
      type: 'session',
      token: { value: 'stale', expiresAt: now + 800_000, lifetimeMs: 900_000 },
      user: ANN,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(tab.getSessionSnapshot().status).toBe('unauthenticated')

    peer.postMessage({
      type: 'session',
      token: { value: 'new', expiresAt: now + 901_000, lifetimeMs: 900_000 },
      user: ANN,
    })
    await vi.waitFor(() => expect(tab.getSessionSnapshot().status).toBe('authenticated'))
    await expect(tab.getValidAccessToken()).resolves.toBe('new')
  })
})

describe('account actions', () => {
  it('a failed sign-in rejects with the API error and leaves the tab signed out', async () => {
    useApi({ 'POST /v1/auth/login': () => problem(401, 'INVALID_CREDENTIALS') })
    const tab = await openTab()
    await tab.ensureBooted()

    await expect(tab.signIn(ANN.email, 'wrong')).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
    expect(tab.getSessionSnapshot().status).toBe('unauthenticated')
    expect(hintValue()).toBeUndefined()
  })

  it('signOut ends the session here at once, then on the server', async () => {
    const api = useApi()
    const tab = await signedInTab()

    const pending = tab.signOut()
    expect(tab.getSessionSnapshot()).toEqual({ status: 'unauthenticated', user: null })
    expect(hintValue()).toBeUndefined()
    await pending

    const logout = api.requests.at(-1)!
    expect(new URL(logout.url).pathname).toBe('/v1/auth/logout')
    expect(logout.keepalive).toBe(true)
    expect(await logout.text()).toBe('{}')
    await expect(tab.getValidAccessToken()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
  })

  it('signOutEverywhere keeps the session when the request fails, and ends every tab when it succeeds', async () => {
    const api = useApi({
      'POST /v1/auth/logout-all': (_request, call) => {
        if (call === 1) throw new TypeError('fetch failed')
        return new Response(null, { status: 204 })
      },
    })
    const first = await signedInTab()
    const second = await openTab()
    await second.ensureBooted()
    const signedOut = vi.fn()
    second.onSignedOut(signedOut)

    await expect(first.signOutEverywhere()).rejects.toMatchObject({ code: 'NETWORK' })
    expect(first.getSessionSnapshot().status).toBe('authenticated')

    await first.signOutEverywhere()
    expect(api.requests.at(-1)!.headers.get('Authorization')).toBe('Bearer login-1')
    expect(first.getSessionSnapshot().status).toBe('unauthenticated')
    await vi.waitFor(() => expect(signedOut).toHaveBeenCalledWith({ reason: 'logout', remote: true }))
  })

  it('getValidAccessToken rejects without a session and makes no call', async () => {
    const api = useApi()
    const tab = await openTab()

    await expect(tab.getValidAccessToken()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(api.fetch).not.toHaveBeenCalled()
  })
})

describe('without Web Locks', () => {
  it('runs a sign-in after a refresh in flight, not beside it', async () => {
    uninstallLocks()
    const answer = deferred<Response>()
    const api = useApi({ 'POST /v1/auth/refresh': () => answer.promise })
    document.cookie = 'cinema_signed_in=1; Path=/'
    const tab = await openTab()

    const boot = tab.ensureBooted()
    await vi.waitFor(() => expect(api.count('POST /v1/auth/refresh')).toBe(1))
    const signIn = tab.signIn(BOB.email, 'secret-password')
    answer.resolve(problem(401, 'REFRESH_INVALID'))
    await boot
    await signIn

    expect(api.count('POST /v1/auth/refresh')).toBe(1)
    // The refresh's 401 (which clears the cookie) came back before the login was sent.
    expect(api.requests.map((request) => new URL(request.url).pathname)).toEqual(['/v1/auth/refresh', '/v1/auth/login'])
    expect(tab.getSessionSnapshot().status).toBe('authenticated')
  })
})
