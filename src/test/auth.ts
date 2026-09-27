import { vi } from 'vitest'
import type { TokenResponse, User } from '@/lib/api/types'

// Stand-ins for the browser features the session module relies on, so tests can run several "tabs" in one
// process: each tab is a fresh copy of the modules (vi.resetModules), and they share what real tabs share — the
// broadcast channel, the lock manager, the cookie jar (jsdom's document.cookie), and the API (a fetch stub).

/** BroadcastChannel within one process: instances with the same name deliver to each other, never to themselves. */
export class FakeBroadcastChannel extends EventTarget {
  /** Delivery delay, to mimic a message that arrives after something else (a lock grant). */
  static delayMs = 0
  private static readonly byName = new Map<string, Set<FakeBroadcastChannel>>()

  static reset(): void {
    FakeBroadcastChannel.byName.clear()
    FakeBroadcastChannel.delayMs = 0
  }

  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
    const peers = FakeBroadcastChannel.byName.get(name) ?? new Set()
    peers.add(this)
    FakeBroadcastChannel.byName.set(name, peers)
  }

  postMessage(data: unknown): void {
    const copy = structuredClone(data)
    for (const peer of FakeBroadcastChannel.byName.get(this.name) ?? []) {
      if (peer === this) continue
      setTimeout(
        () => peer.dispatchEvent(new MessageEvent('message', { data: structuredClone(copy) })),
        FakeBroadcastChannel.delayMs,
      )
    }
  }

  close(): void {
    FakeBroadcastChannel.byName.get(this.name)?.delete(this)
  }
}

/** Web Locks with exclusive locks only: callbacks for one name run one at a time, in request order. */
export class FakeLockManager {
  private readonly tails = new Map<string, Promise<unknown>>()

  request<T>(name: string, callback: () => Promise<T> | T): Promise<T> {
    const run = (this.tails.get(name) ?? Promise.resolve()).then(() => callback())
    this.tails.set(
      name,
      run.catch(() => {}),
    )
    return run
  }
}

export function installLocks(): FakeLockManager {
  const locks = new FakeLockManager()
  Object.defineProperty(window.navigator, 'locks', { value: locks, configurable: true })
  return locks
}

export function uninstallLocks(): void {
  Reflect.deleteProperty(window.navigator, 'locks')
}

export function clearCookies(): void {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

export const ANN: User = {
  id: '0199a1f0-0000-7000-8000-000000000001',
  email: 'ann@example.com',
  role: 'customer',
  created_at: '2026-09-01T10:00:00Z',
}

export const BOB: User = {
  id: '0199a1f0-0000-7000-8000-000000000002',
  email: 'bob@example.com',
  role: 'customer',
  created_at: '2026-09-02T10:00:00Z',
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

export function problem(status: number, code: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title: code, status, code, detail: code.toLowerCase() }), {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

export function tokenResponse(accessToken: string, { user = ANN, expiresIn = 900 } = {}): Response {
  const body: TokenResponse = { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, user }
  return json(body)
}

type Route = (request: Request, call: number) => Response | Promise<Response>

/**
 * The API as a fetch stub. Routes are keyed by "METHOD /path"; `call` counts from 1 per route. A route that is not
 * set answers like the API would for a valid session. Every request is recorded (cloned).
 */
export function fakeApi(routes: Record<string, Route> = {}) {
  let tokens = 0
  const defaults: Record<string, Route> = {
    'POST /v1/auth/refresh': () => tokenResponse(`refreshed-${++tokens}`),
    'POST /v1/auth/login': () => tokenResponse(`login-${++tokens}`),
    'POST /v1/auth/register': () => json(ANN, { status: 201 }),
    'POST /v1/auth/logout': () => new Response(null, { status: 204 }),
    'POST /v1/auth/logout-all': () => new Response(null, { status: 204 }),
    'GET /v1/me': () => json(ANN),
  }
  const counts = new Map<string, number>()
  const requests: Request[] = []

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push(request.clone())
    const key = `${request.method} ${new URL(request.url).pathname}`
    const call = (counts.get(key) ?? 0) + 1
    counts.set(key, call)
    const route = routes[key] ?? defaults[key]
    if (!route) throw new Error(`fakeApi: no route for ${key}`)
    return route(request, call)
  })

  return {
    fetch,
    requests,
    /** How many requests reached "METHOD /path". */
    count: (key: string) => counts.get(key) ?? 0,
  }
}

/** A promise with its resolve function, to hold an answer back until the test lets it go. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}
