'use client'

import { useQuery } from '@tanstack/react-query'
import type { Seat } from '@/lib/api/types'
import { isActiveBooking } from '@/lib/bookings'
import { bookingQuery } from '@/lib/queries/bookings'
import { seatNames } from '@/lib/seat-map'
import { formatCountdown } from '@/lib/time'
import { useCountdown } from '@/hooks/use-countdown'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface ActiveBookingDialogProps {
  /** The viewer's unpaid booking for this showtime; the dialog is open while it is set. */
  bookingId: string | null
  /** The seats the viewer has just picked. */
  selectedSeats: readonly Seat[]
  /** The replacement (release, then hold) is on its way. */
  replacing: boolean
  onContinue: (bookingId: string) => void
  /** Release the earlier booking if it still holds seats (`active`), then hold the picked seats. */
  onReplace: (bookingId: string, active: boolean) => void
  onClose: () => void
}

/**
 * A viewer has at most one unpaid booking per showtime. When they pick seats while they hold others, this asks
 * which to keep: go on to pay for the held seats, or release them and hold the new pick instead.
 */
export function ActiveBookingDialog({
  bookingId,
  selectedSeats,
  replacing,
  onContinue,
  onReplace,
  onClose,
}: ActiveBookingDialogProps) {
  const { data: booking } = useQuery({ ...bookingQuery(bookingId ?? ''), enabled: bookingId !== null })
  const current = booking && booking.id === bookingId ? booking : undefined
  const remaining = useCountdown(current?.status === 'pending' ? current.expires_at : null, current?.created_at)

  const active = current ? isActiveBooking(current) : true
  const processing = current?.status === 'processing'
  const held = current ? seatNames(current.seats) : 'some seats'
  const picked = seatNames(selectedSeats)

  let description: string
  if (!active) {
    description = `Your earlier hold for this showtime has just ended. Hold ${picked} now?`
  } else if (processing) {
    description = `A payment for ${held} is being processed, so they can't be released now.`
  } else {
    const left = remaining !== null && remaining > 0 ? ` (${formatCountdown(remaining)} left)` : ''
    description = `You hold ${held}${left}. Go on to pay for them, or release them and hold ${picked} instead.`
  }

  return (
    <AlertDialog open={bookingId !== null} onOpenChange={(open) => !open && !replacing && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {active ? 'You already hold seats for this showtime' : 'Your earlier hold has ended'}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="xs:flex-wrap">
          <AlertDialogCancel disabled={replacing}>Cancel</AlertDialogCancel>
          {active && !processing ? (
            <Button variant="outline" onClick={() => onReplace(bookingId!, true)} disabled={replacing}>
              {replacing ? 'Holding…' : 'Hold new seats instead'}
            </Button>
          ) : null}
          {active ? (
            <Button onClick={() => onContinue(bookingId!)} disabled={replacing}>
              Go to checkout
            </Button>
          ) : (
            <Button onClick={() => onReplace(bookingId!, false)} disabled={replacing}>
              {replacing ? 'Holding…' : 'Hold these seats'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
