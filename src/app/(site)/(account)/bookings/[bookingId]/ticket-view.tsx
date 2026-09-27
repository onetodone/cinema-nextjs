'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { BanIcon, HourglassIcon, TicketIcon, TimerOffIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/errors'
import type { Booking } from '@/lib/api/types'
import { isBookingId } from '@/lib/bookings'
import { bookingQuery } from '@/lib/queries/bookings'
import { seatNames } from '@/lib/seat-map'
import { formatCountdown, formatDate, formatLongDay, formatShowtime, localDateOf } from '@/lib/time'
import { useCountdown } from '@/hooks/use-countdown'
import { BookingNotFound } from '@/components/bookings/booking-not-found'
import { BookingStatusBadge } from '@/components/bookings/booking-status-badge'
import { TicketQr } from '@/components/bookings/ticket-qr'
import { SeatPriceList, ShowtimeFacts } from '@/components/checkout/booking-summary'
import { BackLink } from '@/components/layout/back-link'
import { LoadError } from '@/components/layout/load-error'
import { Notice } from '@/components/layout/notice'
import { buttonVariants } from '@/components/ui/button'
import { TicketSkeleton } from './ticket-skeleton'

/** How often a booking whose payment is in flight is asked about here (the checkout follows it more closely). */
const PROCESSING_POLL_MS = 10_000

/** One booking of the signed-in user: the ticket once paid, else where it stands (behind AuthGuard). */
export function TicketView({ bookingId }: { bookingId: string }) {
  if (!isBookingId(bookingId)) return <BookingNotFound />
  return <TicketLoader bookingId={bookingId} />
}

function TicketLoader({ bookingId }: { bookingId: string }) {
  const {
    data: booking,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    ...bookingQuery(bookingId),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? PROCESSING_POLL_MS : false),
  })

  if (booking) return <BookingDetails booking={booking} />
  if (isApiError(error) && error.status === 404) return <BookingNotFound />
  if (error) {
    return <LoadError what="this booking" error={error} onRetry={() => void refetch()} retrying={isRefetching} />
  }
  return <TicketSkeleton />
}

function BookingDetails({ booking }: { booking: Booking }) {
  const remaining = useCountdown(booking.status === 'pending' ? booking.expires_at : null, booking.created_at)
  // A pending hold whose time is up is on its way out: the API's worker releases it within seconds.
  const status = booking.status === 'pending' && remaining === 0 ? 'expired' : booking.status
  const { showtime } = booking

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <BackLink href={`/movies/${showtime.movie.id}`}>{showtime.movie.title}</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {status === 'paid' ? 'Your ticket' : 'Your booking'}
          </h1>
          <BookingStatusBadge status={status} />
        </div>
      </div>

      {status === 'paid' ? (
        <TicketCard booking={booking} />
      ) : status === 'pending' || status === 'processing' ? (
        <Notice
          tone="highlight"
          icon={status === 'pending' ? TicketIcon : HourglassIcon}
          role="none"
          title={status === 'pending' ? 'Waiting for your payment' : 'Your payment is being processed'}
          actions={
            <Link href={`/checkout/${booking.id}`} className={buttonVariants({ size: 'lg' })}>
              {status === 'pending' ? 'Continue to checkout' : 'View checkout'}
            </Link>
          }
        >
          {status === 'pending' ? (
            <>
              Your seats are held for{' '}
              <span className="font-medium text-foreground tabular-nums">
                {remaining === null ? '…' : formatCountdown(remaining)}
              </span>{' '}
              more.
            </>
          ) : (
            'The seats stay yours while it completes. This page updates by itself.'
          )}
        </Notice>
      ) : (
        <Notice
          icon={status === 'expired' ? TimerOffIcon : BanIcon}
          role="none"
          title={status === 'expired' ? 'This hold expired before it was paid' : 'This booking was canceled'}
          actions={
            <Link href={`/showtimes/${showtime.id}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Choose seats again
            </Link>
          }
        >
          Its seats were released. Nothing was charged.
        </Notice>
      )}

      <section aria-labelledby="receipt-heading" className="flex flex-col gap-3">
        <h2 id="receipt-heading" className="text-xl font-semibold tracking-tight">
          {status === 'paid' ? 'Receipt' : 'Seats and price'}
        </h2>
        {status === 'paid' ? null : <ShowtimeFacts showtime={showtime} />}
        <SeatPriceList booking={booking} />
        {booking.paid_at ? (
          <p className="text-sm text-muted-foreground">Paid on {formatDate(booking.paid_at)}.</p>
        ) : null}
      </section>
    </div>
  )
}

/** The ticket itself: the code to show at the entrance, and what it is for. */
function TicketCard({ booking }: { booking: Booking }) {
  const { showtime } = booking
  return (
    <section
      aria-labelledby="ticket-heading"
      className="flex flex-col gap-6 rounded-2xl border bg-card p-5 text-card-foreground sm:flex-row sm:items-center sm:p-6"
    >
      <TicketQr
        value={booking.id}
        label={`Ticket code for booking ${booking.id}`}
        className="w-48 self-center sm:w-44 sm:shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="ticket-heading" className="text-2xl font-semibold tracking-tight text-balance">
            {showtime.movie.title}
          </h2>
          <p className="text-sm text-muted-foreground">Show this code at the entrance.</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Fact term="Date">{formatLongDay(localDateOf(showtime.starts_at))}</Fact>
          <Fact term="Time">{formatShowtime(showtime.starts_at)}</Fact>
          <Fact term="Hall">{showtime.hall.name}</Fact>
          <Fact term={booking.seats.length === 1 ? 'Seat' : 'Seats'}>{seatNames(booking.seats)}</Fact>
        </dl>
        <p className="text-xs text-muted-foreground">
          Booking <span className="font-mono break-all">{booking.id}</span>
        </p>
      </div>
    </section>
  )
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{term}</dt>
      <dd className="text-base font-medium">{children}</dd>
    </div>
  )
}
