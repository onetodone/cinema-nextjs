import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { isApiError } from '@/lib/api/errors'
import { unwrap } from '@/lib/api/problem'
import { queryKeys } from '@/lib/queries/keys'

/** The caller's signed-in browsers and devices, most recently used first (at most 20: no pages). */
export function sessionsQuery() {
  return queryOptions({
    queryKey: queryKeys.private.sessions(),
    queryFn: async ({ signal }) => (await unwrap(api.GET('/v1/auth/sessions', { signal }))).items,
  })
}

/**
 * Ends one of the caller's other sessions: it can no longer refresh, and its access tokens stop working at once. A
 * session that has already ended (`SESSION_NOT_FOUND`) counts as done. This tab's own session ends with `signOut`,
 * which also clears its state.
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    await unwrap(
      api.DELETE('/v1/auth/sessions/{sessionID}', {
        params: { path: { sessionID: sessionId } },
        signal: AbortSignal.timeout(15_000),
      }),
    )
  } catch (error) {
    if (isApiError(error) && error.code === 'SESSION_NOT_FOUND') return
    throw error
  }
}
