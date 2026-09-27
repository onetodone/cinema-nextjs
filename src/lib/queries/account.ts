import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { unwrap } from '@/lib/api/problem'
import { queryKeys } from '@/lib/queries/keys'

/** The signed-in account (`GET /v1/me`), for the account page; the header uses the user from the session instead. */
export function meQuery() {
  return queryOptions({
    queryKey: queryKeys.private.me(),
    queryFn: ({ signal }) => unwrap(api.GET('/v1/me', { signal })),
  })
}
