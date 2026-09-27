'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRightIcon, Loader2Icon, TimerIcon } from 'lucide-react'
import type { Booking } from '@/lib/api/types'
import { useAuth } from '@/lib/auth/context'
import { nextToExpire } from '@/lib/bookings'
import { HOLD_WARNING_MS } from '@/lib/checkout'
import { queryKeys } from '@/lib/queries/keys'
import { seatNames } from '@/lib/seat-map'
import { formatCountdown } from '@/lib/time'
import { useActiveBookings } from '@/hooks/use-active-bookings'
import { useCountdown } from '@/hooks/use-countdown'
import { cn } from '@/lib/utils'

type Variant = 'pill' | 'bar'

/**
 * "Seats held · 12:34" in the header while the signed-in user has an unpaid booking, leading back to its checkout
 * (the one that runs out first, if there are several). Hidden on that checkout itself. The header shows it as a
 * `pill` in its row from the `sm` breakpoint up, and as a full-width `bar` under the header on phones, where the row
 * has no room left.
 */
export function ActiveHoldPill({ variant = 'pill' }: { variant?: Variant }) {
  const { status } = useAuth()
  const booking = nextToExpire(useActiveBookings())
  // Signed in only, so after hydration only: reading the pathname never holds up prerendering.
  if (status !== 'authenticated' || !booking) return null
  return <Pill booking={booking} variant={variant} />
}

function Pill({ booking, variant }: { booking: Booking; variant: Variant }) {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const processing = booking.status === 'processing'
  const remaining = useCountdown(processing ? null : booking.expires_at, booking.created_at)
  const over = !processing && remaining === 0

  // The hold ran out: refetch the list (the API's worker releases it within seconds).
  useEffect(() => {
    if (over) void queryClient.invalidateQueries({ queryKey: queryKeys.private.activeBookings() })
  }, [over, queryClient])

  const href = `/checkout/${booking.id}`
  if (over || pathname === href) return null

  const warning = remaining !== null && remaining <= HOLD_WARNING_MS
  const time = remaining === null ? '–:––' : formatCountdown(remaining)
  const label = processing
    ? `Payment processing for ${seatNames(booking.seats)}. Open checkout.`
    : `Seats ${seatNames(booking.seats)} held, ${time} left. Open checkout.`

  const icon = processing ? (
    <Loader2Icon className="size-3.5 text-primary motion-safe:animate-spin" aria-hidden="true" />
  ) : (
    <TimerIcon className={cn('size-3.5', warning ? 'text-destructive' : 'text-primary')} aria-hidden="true" />
  )
  const tone = warning
    ? 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20'
    : 'border-primary/50 bg-primary/10 text-foreground hover:bg-primary/20'

  if (variant === 'bar') {
    // On an opaque backing: the page scrolls under it.
    return (
      <div className="bg-background shadow-xs">
        <Link
          href={href}
          aria-label={label}
          data-hold-strip=""
          className={cn(
            'flex h-8 items-center gap-2 border-b px-4 text-sm font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
            tone,
          )}
        >
          {icon}
          <span className="flex-1">{processing ? 'Payment processing' : `Seats held · ${time} left`}</span>
          <span className="inline-flex items-center gap-1">
            Checkout
            <ArrowRightIcon className="size-3.5" aria-hidden="true" />
          </span>
        </Link>
      </div>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        tone,
      )}
    >
      {icon}
      <span>{processing ? 'Paying' : 'Seats held'}</span>
      {processing ? null : <span>{time}</span>}
    </Link>
  )
}
