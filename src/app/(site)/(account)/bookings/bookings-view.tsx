'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import type { Booking } from '@/lib/api/types'
import { awaitsSettlement, groupBookingHistory, isActiveBooking } from '@/lib/bookings'
import { activeBookingsQuery, bookingHistoryQuery } from '@/lib/queries/bookings'
import { queryKeys } from '@/lib/queries/keys'
import { serverSkewMs } from '@/lib/server-clock'
import { instantOf } from '@/lib/time'
import { useCountdown } from '@/hooks/use-countdown'
import { useNow } from '@/hooks/use-now'
import { BookingCard, BookingCardList, HoldDetail } from '@/components/bookings/booking-card'
import { LoadError } from '@/components/layout/load-error'
import { EmptyState, SectionHeader } from '@/components/layout/page'
import { Button, buttonVariants } from '@/components/ui/button'
import { BookingsSkeleton } from './bookings-skeleton'

/** How often unpaid bookings that are about to change on their own (a payment settling, a hold ending) are asked about. */
const SETTLE_POLL_MS = 5_000

/**
 * "My bookings" of the signed-in user (behind AuthGuard): unpaid holds first (all of them, from one request), then
 * paid tickets still to come, then everything that is over, loaded page by page.
 */
export function BookingsView() {
  const now = useNow()
  const active = useQuery({
    ...activeBookingsQuery(),
    refetchInterval: (query) =>
      awaitsSettlement(query.state.data ?? [], Date.now() + serverSkewMs()) ? SETTLE_POLL_MS : false,
  })
  const history = useInfiniteQuery(bookingHistoryQuery())
  useHistoryFollowsHolds(active.data)

  const listRef = useRef<HTMLDivElement>(null)
  const knownIdsRef = useRef<Set<string> | null>(null)
  const historyItems = history.data?.pages.flatMap((page) => page.items) ?? []

  // After "Load more", focus moves to the first booking that was not there before, so keyboard users continue where
  // the list grew (the button may be gone on the last page).
  useEffect(() => {
    const known = knownIdsRef.current
    if (!known) return
    const next = bookingLinks(listRef.current).find((link) => !known.has(link.dataset.bookingId ?? ''))
    if (next) {
      knownIdsRef.current = null
      next.focus()
    }
  }, [historyItems.length])

  if (now === null || active.isPending || history.isPending) return <BookingsSkeleton />

  const holds = (active.data ?? [])
    .filter(isActiveBooking)
    .sort((a, b) => instantOf(a.expires_at) - instantOf(b.expires_at))
  const { upcoming, past } = groupBookingHistory(historyItems, now)
  const shown = holds.length + upcoming.length + past.length

  function loadMore() {
    knownIdsRef.current = new Set(bookingLinks(listRef.current).map((link) => link.dataset.bookingId ?? ''))
    void history.fetchNextPage()
  }

  return (
    <div ref={listRef} className="flex flex-col gap-10">
      {holds.length > 0 || active.isError ? (
        <section aria-labelledby="holds-heading" className="flex flex-col gap-4">
          <SectionHeader id="holds-heading" title="Awaiting payment" />
          {holds.length > 0 ? (
            <BookingCardList>
              {holds.map((booking) => (
                <li key={booking.id}>
                  <HoldCard booking={booking} />
                </li>
              ))}
            </BookingCardList>
          ) : (
            <LoadError
              what="your seats on hold"
              error={active.error}
              onRetry={() => void active.refetch()}
              retrying={active.isRefetching}
            />
          )}
        </section>
      ) : null}

      {history.isError && !history.data ? (
        <LoadError
          what="your bookings"
          error={history.error}
          onRetry={() => void history.refetch()}
          retrying={history.isRefetching}
        />
      ) : shown === 0 && !history.hasNextPage && !active.isError ? (
        <EmptyState title="No bookings yet">
          <div className="flex flex-col items-center gap-3">
            <p>Pick a showtime and your seats — your tickets will be here.</p>
            <ScheduleLink />
          </div>
        </EmptyState>
      ) : (
        <>
          <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4">
            <SectionHeader id="upcoming-heading" title="Upcoming" />
            {upcoming.length > 0 ? (
              <BookingCardList>
                {upcoming.map((booking) => (
                  <li key={booking.id}>
                    <BookingCard booking={booking} href={`/bookings/${booking.id}`} />
                  </li>
                ))}
              </BookingCardList>
            ) : (
              <EmptyState title="No upcoming tickets">
                <div className="flex flex-col items-center gap-3">
                  <p>Tickets you buy for a showtime show up here until it starts.</p>
                  <ScheduleLink />
                </div>
              </EmptyState>
            )}
          </section>

          {past.length > 0 ? (
            <section aria-labelledby="past-heading" className="flex flex-col gap-4">
              <SectionHeader id="past-heading" title="Past & canceled" />
              <BookingCardList>
                {past.map((booking) => (
                  <li key={booking.id}>
                    <BookingCard booking={booking} href={`/bookings/${booking.id}`} muted />
                  </li>
                ))}
              </BookingCardList>
            </section>
          ) : null}

          {history.isFetchNextPageError ? (
            <p role="alert" className="text-center text-sm text-destructive">
              We couldn&apos;t load more bookings. Please try again.
            </p>
          ) : null}
          {history.hasNextPage ? (
            <div className="flex justify-center">
              <Button variant="outline" size="lg" onClick={loadMore} disabled={history.isFetchingNextPage}>
                {history.isFetchingNextPage ? (
                  <Loader2Icon className="motion-safe:animate-spin" aria-hidden="true" />
                ) : null}
                {history.isFetchingNextPage ? 'Loading…' : 'Load older bookings'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {shown} {shown === 1 ? 'booking' : 'bookings'} shown
      </p>
    </div>
  )
}

/** A hold waiting for payment: the time left, and the way to its checkout. */
function HoldCard({ booking }: { booking: Booking }) {
  const queryClient = useQueryClient()
  const pending = booking.status === 'pending'
  const remaining = useCountdown(pending ? booking.expires_at : null, booking.created_at)
  const over = pending && remaining === 0

  // The hold ran out: ask again. The API's worker releases it within seconds; the list polls until it has.
  useEffect(() => {
    if (over) void queryClient.invalidateQueries({ queryKey: queryKeys.private.activeBookings() })
  }, [over, queryClient])

  return (
    <BookingCard
      booking={booking}
      status={over ? 'expired' : booking.status}
      href={over ? `/bookings/${booking.id}` : `/checkout/${booking.id}`}
      detail={<HoldDetail booking={booking} remaining={remaining} />}
      muted={over}
    />
  )
}

function ScheduleLink() {
  return (
    <Link href="/schedule" className={buttonVariants({ variant: 'outline' })}>
      See the schedule
    </Link>
  )
}

function bookingLinks(root: HTMLElement | null): HTMLAnchorElement[] {
  return root ? [...root.querySelectorAll<HTMLAnchorElement>('a[data-booking-id]')] : []
}

/**
 * A hold that leaves the unpaid list was paid, expired, or canceled: it now belongs to the history, so the history is
 * asked again (a new hold arriving needs nothing: it is not part of the history).
 */
function useHistoryFollowsHolds(holds: readonly Booking[] | undefined) {
  const queryClient = useQueryClient()
  const previousRef = useRef<ReadonlySet<string> | null>(null)

  useEffect(() => {
    if (!holds) return
    const ids = new Set(holds.map((booking) => booking.id))
    const previous = previousRef.current
    previousRef.current = ids
    if (previous && [...previous].some((id) => !ids.has(id))) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.private.bookingHistory() })
    }
  }, [holds, queryClient])
}
