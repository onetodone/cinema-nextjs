import createClient from 'openapi-fetch'
import type { paths } from '@/lib/api/schema'
import { expireSession, getValidAccessToken, refreshAccessToken } from '@/lib/auth/session'

// The auth-aware browser client for personal data (bookings, payments, the account). Public reads use `publicApi`
// (lib/api/public.ts), which never waits for a session.

/** 401 codes that mean "this token is no good" (as opposed to, say, wrong credentials). */
const TOKEN_REJECTIONS = new Set(['UNAUTHENTICATED', 'INVALID_TOKEN', 'TOKEN_EXPIRED'])

async function isTokenRejection(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  try {
    const body: unknown = await response.clone().json()
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined
    return typeof code !== 'string' || TOKEN_REJECTIONS.has(code)
  } catch {
    return true
  }
}

function send(request: Request, token: string): Promise<Response> {
  request.headers.set('Authorization', `Bearer ${token}`)
  return globalThis.fetch(request)
}

/**
 * Sends a request with this tab's access token. When the API refuses the token (it expired early, or its session was
 * revoked), refreshes once and sends the same request again — the same body and the same Idempotency-Key, so a
 * retried hold or payment is replayed rather than repeated. A second refusal signs the tab out.
 *
 * Throws an ApiError (status 401) when there is no session, and a network error when there is no answer.
 */
export async function authFetch(request: Request): Promise<Response> {
  const retry = request.clone()
  const token = await getValidAccessToken()
  const response = await send(request, token)
  if (!(await isTokenRejection(response))) return response

  const fresh = await refreshAccessToken(token)
  const second = await send(retry, fresh)
  if (await isTokenRejection(second)) expireSession()
  return second
}

export const api = createClient<paths>({
  // See lib/api/public.ts for why the base URL is absolute.
  baseUrl: typeof window === 'undefined' ? '' : window.location.origin,
  fetch: authFetch,
})
