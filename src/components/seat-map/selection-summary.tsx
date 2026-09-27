import { AlertCircleIcon, ArrowRightIcon, Loader2Icon } from 'lucide-react'
import type { Seat } from '@/lib/api/types'
import { formatMoney } from '@/lib/money'
import { MAX_SEATS_PER_BOOKING, seatNames } from '@/lib/seat-map'
import { Button } from '@/components/ui/button'

export interface SummaryError {
  message: string
  /** A request id to quote to support, for failures on the server's side. */
  reference?: string | null
}

interface SelectionSummaryProps {
  /** The picked seats, in map order. */
  seats: readonly Seat[]
  currency: string
  bookable: boolean
  /** A hold request is on its way. */
  pending?: boolean
  /** Why the last hold did not work (the button tries again). */
  error?: SummaryError | null
  onClear: () => void
  onContinue: () => void
}

/** The bar that sticks to the bottom of the screen under the seat map: picked seats, their total, and the next step. */
export function SelectionSummary({
  seats,
  currency,
  bookable,
  pending = false,
  error = null,
  onClear,
  onContinue,
}: SelectionSummaryProps) {
  const count = seats.length
  // Integer cents; the booking's own total comes from the API once seats are held.
  const total = seats.reduce((sum, seat) => sum + seat.price_cents, 0)

  return (
    <div className="sticky bottom-0 z-30 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-3 shadow-[0_-12px_24px_-16px] shadow-foreground/25 backdrop-blur supports-backdrop-filter:bg-background/80 sm:mx-0 sm:rounded-t-xl sm:border-x">
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {error.message}
            {error.reference ? <span className="text-muted-foreground"> Reference: {error.reference}</span> : null}
          </span>
        </p>
      ) : null}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          {count === 0 ? (
            <>
              <p className="font-medium">No seats picked</p>
              <p className="text-sm text-muted-foreground">
                {bookable ? `Pick up to ${MAX_SEATS_PER_BOOKING} seats on the map.` : 'Seats can’t be booked.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">
                {count} {count === 1 ? 'seat' : 'seats'} · {formatMoney(total, currency)}
              </p>
              <p className="truncate text-sm text-muted-foreground">{seatNames(seats)}</p>
            </>
          )}
        </div>
        {count > 0 ? (
          <Button variant="ghost" size="lg" onClick={onClear} disabled={pending}>
            Clear
          </Button>
        ) : null}
        <Button size="lg" disabled={count === 0 || !bookable || pending} onClick={onContinue}>
          {pending ? (
            <>
              <Loader2Icon data-icon="inline-start" className="motion-safe:animate-spin" aria-hidden="true" />
              Holding…
            </>
          ) : (
            <>
              Continue
              <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
