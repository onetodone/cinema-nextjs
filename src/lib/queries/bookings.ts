import { infiniteQueryOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { unwrap, unwrapWithResponse } from '@/lib/api/problem'
import type { Booking, BookingStatus } from '@/lib/api/types'
import { queryKeys } from '@/lib/queries/keys'
import { recordServerTime } from '@/lib/server-clock'
import { postSyncMessage, type BookingsChange } from '@/lib/sync'

/** A hold or cancel request without an answer after this long counts as lost (and may be sent again). */
const REQUEST_TIMEOUT_MS = 20_000

/** Bookings that hold seats and wait for payment. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'processing']

/** Bookings that are over, one way or another: the history part of "My bookings". */
export const SETTLED_BOOKING_STATUSES: readonly BookingStatus[] = ['paid', 'expired', 'canceled']

/** Bookings per page of "My bookings". */
export const BOOKING_HISTORY_PAGE_SIZE = 20

/** One booking of the caller. Every answer also updates the server-clock skew the hold countdown uses. */
export function bookingQuery(bookingId: string) {
  return queryOptions({
    queryKey: queryKeys.private.booking(bookingId),
    queryFn: async ({ signal }) => {
      const { data, response } = await unwrapWithResponse(
        api.GET('/v1/bookings/{bookingID}', { params: { path: { bookingID: bookingId } }, signal }),
      )
      recordServerTime(response)
      return data
    },
  })
}

/**
 * The caller's unpaid bookings, newest first: the hold pill in the header, and "you already hold seats here" on a
 * seat map. A caller has at most one per showtime, and holds last minutes, so one page is all of them in practice.
 */
export function activeBookingsQuery() {
  return queryOptions({
    queryKey: queryKeys.private.activeBookings(),
    queryFn: async ({ signal }) => {
      const { data, response } = await unwrapWithResponse(
        api.GET('/v1/bookings', { params: { query: { status: [...ACTIVE_BOOKING_STATUSES], limit: 100 } }, signal }),
      )
      recordServerTime(response)
      return data.items
    },
  })
}

/**
 * The caller's paid, expired, and canceled bookings, newest first, page by page ("Load more"). The unpaid ones come
 * from `activeBookingsQuery`, which is complete in one request, so a booking is never listed twice.
 */
export function bookingHistoryQuery() {
  return infiniteQueryOptions({
    queryKey: queryKeys.private.bookingHistory(),
    queryFn: ({ pageParam, signal }) =>
      unwrap(
        api.GET('/v1/bookings', {
          params: {
            query: { status: [...SETTLED_BOOKING_STATUSES], limit: BOOKING_HISTORY_PAGE_SIZE, cursor: pageParam },
          },
          signal,
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
  })
}

export interface HoldRequest {
  showtimeId: number
  seatIds: readonly number[]
  idempotencyKey: string
}

/** Holds seats (`POST /v1/bookings`). Rejects with an ApiError; see `holdOutcome` for what each one means. */
export async function holdSeats({ showtimeId, seatIds, idempotencyKey }: HoldRequest): Promise<Booking> {
  const { data, response } = await unwrapWithResponse(
    api.POST('/v1/bookings', {
      params: { header: { 'Idempotency-Key': idempotencyKey } },
      body: { showtime_id: showtimeId, seat_ids: [...seatIds] },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  )
  recordServerTime(response)
  return data
}

/** Releases the seats of an unpaid booking. Succeeds for a booking that is already canceled or expired. */
export async function cancelBooking(bookingId: string): Promise<void> {
  await unwrap(
    api.DELETE('/v1/bookings/{bookingID}', {
      params: { path: { bookingID: bookingId } },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }),
  )
}

interface RefreshOptions {
  /** The cache already holds the booking as the API just answered it: refetch everything else. */
  keepBooking?: boolean
}

/** Refetches what a change to the caller's bookings affects: the booking queries and the showtime's seat map. */
export function refreshAfterBookingsChange(
  queryClient: QueryClient,
  { bookingId, showtimeId }: BookingsChange,
  { keepBooking = false }: RefreshOptions = {},
): void {
  const kept = keepBooking && bookingId !== undefined ? queryKeys.private.booking(bookingId) : null
  void queryClient.invalidateQueries({
    queryKey: queryKeys.private.bookings(),
    predicate: (query) => kept === null || query.queryKey.join('\0') !== kept.join('\0'),
  })
  if (showtimeId !== undefined) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.seatMap(showtimeId) })
  }
}

/** A booking changed here (held, canceled, paid, settled): refresh this tab, and tell the other tabs to. */
export function bookingsChanged(queryClient: QueryClient, change: BookingsChange, options?: RefreshOptions): void {
  refreshAfterBookingsChange(queryClient, change, options)
  postSyncMessage({ type: 'bookings-changed', ...change })
}
