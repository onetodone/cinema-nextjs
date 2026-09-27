import { useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Booking } from '@/lib/api/types'
import { holdOutcome } from '@/lib/bookings'
import { isKeySpent, newIdempotencyKey } from '@/lib/idempotency'
import { bookingsChanged, holdSeats, type HoldRequest } from '@/lib/queries/bookings'
import { queryKeys } from '@/lib/queries/keys'

/** The longest wait before the one automatic retry of a hold that found its seats busy. */
const MAX_BUSY_WAIT_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Sends a hold; when the seats or the caller's bookings are busy for a moment, tries once more with the same key. */
async function holdWithOneRetry(request: HoldRequest): Promise<Booking> {
  try {
    return await holdSeats(request)
  } catch (error) {
    const outcome = holdOutcome(error)
    if (outcome.kind !== 'busy') throw error
    await sleep(Math.min(outcome.retryAfterMs, MAX_BUSY_WAIT_MS))
    return holdSeats(request)
  }
}

/**
 * Holding seats of a showtime. Each attempt has an Idempotency-Key tied to the seats it asks for: sending the same
 * seats again after an answer that got lost or asked for a retry reuses it (so a hold is never made twice), and a
 * different selection, or any final answer, starts a new one.
 *
 * On success the booking is put in the cache for the checkout, and this tab and the others refetch what changed.
 */
export function useHoldSeats(showtimeId: number) {
  const queryClient = useQueryClient()
  const attempt = useRef<{ seats: string; key: string } | null>(null)

  return useMutation({
    mutationFn: async (seatIds: readonly number[]) => {
      const seats = [...seatIds].sort((a, b) => a - b).join(',')
      if (attempt.current?.seats !== seats) attempt.current = { seats, key: newIdempotencyKey() }
      try {
        return await holdWithOneRetry({ showtimeId, seatIds, idempotencyKey: attempt.current.key })
      } catch (error) {
        if (isKeySpent(error)) attempt.current = null
        throw error
      }
    },
    onSuccess: (booking) => {
      attempt.current = null
      queryClient.setQueryData(queryKeys.private.booking(booking.id), booking)
      bookingsChanged(queryClient, { bookingId: booking.id, showtimeId }, { keepBooking: true })
    },
  })
}
