import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { publicApi } from '@/lib/api/client'
import { unwrap } from '@/lib/api/problem'
import type { MovieList } from '@/lib/api/types'
import { MOVIES_PAGE_SIZE } from '@/lib/catalog'
import { queryKeys } from '@/lib/queries/keys'

/** How often a visible seat map asks for changes (the API caches it for at most 5 s). */
export const SEAT_MAP_POLL_MS = 5_000

/**
 * The movies list after its server-rendered first page: "Load more" fetches the next pages through the /v1 proxy.
 * Movies change rarely, so loaded pages are not refetched on focus.
 */
export function moviesInfiniteQuery(firstPage: MovieList) {
  return infiniteQueryOptions({
    queryKey: queryKeys.catalog.movies(),
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        publicApi.GET('/v1/movies', { params: { query: { cursor: pageParam, limit: MOVIES_PAGE_SIZE } }, signal }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    initialData: { pages: [firstPage], pageParams: [undefined] },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
}

/**
 * A live seat map: polled every 5 s while the tab is visible and the showtime is bookable, and refreshed when the
 * tab regains focus. The browser revalidates with the API's ETag, and structural sharing keeps unchanged seats
 * as the same objects, so an unchanged map re-renders nothing.
 */
export function seatMapQuery(showtimeId: number, { live }: { live: boolean }) {
  return queryOptions({
    queryKey: queryKeys.catalog.seatMap(showtimeId),
    queryFn: ({ signal }) =>
      unwrap(
        publicApi.GET('/v1/showtimes/{showtimeID}/seats', { params: { path: { showtimeID: showtimeId } }, signal }),
      ),
    refetchInterval: live ? SEAT_MAP_POLL_MS : false,
    staleTime: SEAT_MAP_POLL_MS - 1_000,
  })
}
