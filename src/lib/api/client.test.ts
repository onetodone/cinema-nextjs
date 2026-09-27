import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANN,
  FakeBroadcastChannel,
  clearCookies,
  deferred,
  fakeApi,
  installLocks,
  json,
  problem,
  uninstallLocks,
} from '@/test/auth'

type Modules = typeof import('@/lib/auth/session') &
  typeof import('@/lib/api/client') &
  typeof import('@/lib/api/problem')

/** A signed-in tab: the session, the auth-aware client, and unwrap from one fresh module graph. */
async function signedInTab(): Promise<Modules> {
  vi.resetModules()
  const session = await import('@/lib/auth/session')
  const client = await import('@/lib/api/client')
  const problemModule = await import('@/lib/api/problem')
  await session.ensureBooted()
  await session.signIn(ANN.email, 'secret-password')
  return { ...session, ...client, ...problemModule }
}

function bearerOf(request: Request): string | null {
  return request.headers.get('Authorization')
}

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  installLocks()
  clearCookies()
})

afterEach(() => {
  uninstallLocks()
})

describe('authFetch', () => {
  it('sends the access token', async () => {
    const api = fakeApi()
    vi.stubGlobal('fetch', api.fetch)
    const tab = await signedInTab()

    await expect(tab.unwrap(tab.api.GET('/v1/me'))).resolves.toEqual(ANN)
    expect(bearerOf(api.requests.at(-1)!)).toBe('Bearer login-1')
  })

  it('refreshes once and replays the same request when the token is refused', async () => {
    const api = fakeApi({
      'POST /v1/bookings': (request, call) =>
        call === 1
          ? problem(401, 'TOKEN_EXPIRED', { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
          : json({ id: 'b-1', seen: request.headers.get('Idempotency-Key') }, { status: 201 }),
    })
    vi.stubGlobal('fetch', api.fetch)
    const tab = await signedInTab()

    const booking = await tab.unwrap(
      tab.api.POST('/v1/bookings', {
        body: { showtime_id: 7, seat_ids: [1, 2] },
        params: { header: { 'Idempotency-Key': 'key-1' } },
      }),
    )

    expect(booking).toEqual({ id: 'b-1', seen: 'key-1' })
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
    const [first, second] = api.requests.filter((request) => request.url.endsWith('/v1/bookings'))
    expect(bearerOf(first)).toBe('Bearer login-1')
    expect(bearerOf(second)).toBe('Bearer refreshed-2')
    expect(second.headers.get('Idempotency-Key')).toBe('key-1')
    expect(await second.json()).toEqual({ showtime_id: 7, seat_ids: [1, 2] })
  })

  it('makes one refresh for concurrent refusals', async () => {
    const answer = deferred<Response>()
    const api = fakeApi({
      'POST /v1/auth/refresh': () => answer.promise,
      'GET /v1/me': (request) => (bearerOf(request) === 'Bearer login-1' ? problem(401, 'TOKEN_EXPIRED') : json(ANN)),
    })
    vi.stubGlobal('fetch', api.fetch)
    const tab = await signedInTab()

    const calls = Array.from({ length: 5 }, () => tab.unwrap(tab.api.GET('/v1/me')))
    await vi.waitFor(() => expect(api.count('POST /v1/auth/refresh')).toBe(1))
    answer.resolve(json({ access_token: 'refreshed-2', token_type: 'Bearer', expires_in: 900, user: ANN }))

    await expect(Promise.all(calls)).resolves.toEqual(Array(5).fill(ANN))
    expect(api.count('POST /v1/auth/refresh')).toBe(1)
    expect(api.count('GET /v1/me')).toBe(10)
  })

  it('signs out when the refreshed token is refused too (a revoked session)', async () => {
    const api = fakeApi({ 'GET /v1/me': () => problem(401, 'INVALID_TOKEN') })
    vi.stubGlobal('fetch', api.fetch)
    const tab = await signedInTab()
    const signedOut = vi.fn()
    tab.onSignedOut(signedOut)

    await expect(tab.unwrap(tab.api.GET('/v1/me'))).rejects.toMatchObject({ status: 401, code: 'INVALID_TOKEN' })
    expect(tab.getSessionSnapshot().status).toBe('unauthenticated')
    expect(signedOut).toHaveBeenCalledWith({ reason: 'expired', remote: false })
  })

  it('passes other answers through untouched', async () => {
    const api = fakeApi({ 'GET /v1/me': () => problem(503, 'INTERNAL') })
    vi.stubGlobal('fetch', api.fetch)
    const tab = await signedInTab()

    await expect(tab.unwrap(tab.api.GET('/v1/me'))).rejects.toMatchObject({ status: 503 })
    expect(api.count('POST /v1/auth/refresh')).toBe(0)
    expect(tab.getSessionSnapshot().status).toBe('authenticated')
  })

  it('fails without a request when nobody is signed in', async () => {
    const api = fakeApi()
    vi.stubGlobal('fetch', api.fetch)
    vi.resetModules()
    const session = await import('@/lib/auth/session')
    const { api: client } = await import('@/lib/api/client')
    const { unwrap } = await import('@/lib/api/problem')
    await session.ensureBooted()

    await expect(unwrap(client.GET('/v1/me'))).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(api.fetch).not.toHaveBeenCalled()
  })
})
