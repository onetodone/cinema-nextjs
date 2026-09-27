'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Loader2Icon, TimerIcon } from 'lucide-react'
import type { Booking, BookingStatus } from '@/lib/api/types'
import { HOLD_WARNING_MS } from '@/lib/checkout'
import { formatMoney } from '@/lib/money'
import { seatNames } from '@/lib/seat-map'
import { dayParts, formatCountdown, formatLongDay, formatShowtime, localDateOf } from '@/lib/time'
import { BookingStatusBadge } from '@/components/bookings/booking-status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** "2 seats · $22.00"; a booking that ended unpaid says it cost nothing. */
function priceLine(booking: Booking, status: BookingStatus): string {
  const seats = `${booking.seats.length} ${booking.seats.length === 1 ? 'seat' : 'seats'}`
  if (status === 'expired' || status === 'canceled') return `${seats} · nothing charged`
  return `${seats} · ${formatMoney(booking.total_cents, booking.currency)}`
}

/**
 * One booking in "My bookings": the day as a calendar tile, the movie, when, where, and which seats, and its status.
 * The whole card is one link (to the ticket, or to the checkout while it waits for payment); its accessible name
 * carries the date and time, so a list of links read out one by one stays tellable apart.
 */
export function BookingCard({
  booking,
  status = booking.status,
  href,
  detail,
  muted = false,
}: {
  booking: Booking
  /** The status to show, when it is ahead of the API's (a hold whose time is up is shown expired). */
  status?: BookingStatus
  href: string
  /** A line under the facts in place of the seats and price (the time left to pay). */
  detail?: ReactNode
  /** Over and done with: a quieter card. */
  muted?: boolean
}) {
  const { showtime } = booking
  const day = localDateOf(showtime.starts_at)
  const { weekday, day: dayOfMonth, month } = dayParts(day)
  const time = formatShowtime(showtime.starts_at)

  return (
    <article
      className={cn(
        'relative flex gap-4 rounded-xl border p-4 transition-colors has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50',
        muted ? 'bg-muted/30 hover:bg-muted/60' : 'bg-card hover:border-primary/50',
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex w-14 shrink-0 flex-col items-center self-start rounded-lg border py-2',
          muted ? 'text-muted-foreground' : 'border-primary/40 bg-primary/10',
        )}
      >
        <span className="text-xs">{weekday}</span>
        <span className="text-xl leading-7 font-semibold tabular-nums">{dayOfMonth}</span>
        <span className="text-xs">{month}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="leading-6 font-semibold text-pretty">
            {/* Stretched over the card, so the whole card is the link's target. */}
            <Link
              href={href}
              data-booking-id={booking.id}
              className="outline-none after:absolute after:inset-0 after:rounded-xl"
            >
              {showtime.movie.title}
              <span className="sr-only">
                , {formatLongDay(day)} at {time}
              </span>
            </Link>
          </h3>
          <BookingStatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {time} · {showtime.hall.name} · {booking.seats.length === 1 ? 'Seat' : 'Seats'} {seatNames(booking.seats)}
        </p>
        <div className="text-sm">{detail ?? priceLine(booking, status)}</div>
      </div>
    </article>
  )
}

/** The time left to pay for a hold, or that its payment is on the way. */
export function HoldDetail({ booking, remaining }: { booking: Booking; remaining: number | null }) {
  if (booking.status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2Icon className="size-3.5 text-primary motion-safe:animate-spin" aria-hidden="true" />
        Payment processing — the seats stay yours meanwhile
      </span>
    )
  }
  if (remaining === 0)
    return <span className="text-muted-foreground">The hold ran out — the seats go back on sale</span>
  const warning = remaining !== null && remaining <= HOLD_WARNING_MS
  return (
    <span className={cn('inline-flex items-center gap-1.5', warning && 'text-destructive')}>
      <TimerIcon className={cn('size-3.5', warning ? 'text-destructive' : 'text-primary')} aria-hidden="true" />
      <span>
        Held for{' '}
        <span className="font-medium tabular-nums">{remaining === null ? '–:––' : formatCountdown(remaining)}</span>{' '}
        more · {formatMoney(booking.total_cents, booking.currency)} to pay
      </span>
    </span>
  )
}

export function BookingCardList({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('flex flex-col gap-3', className)} {...props} />
}

/** A card's shape while the list loads. */
export function BookingCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border p-4" aria-hidden="true">
      <Skeleton className="h-19 w-14 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2 pt-0.5">
        <div className="flex justify-between gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16 rounded-4xl" />
        </div>
        <Skeleton className="h-4 w-52 max-w-full" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  )
}
