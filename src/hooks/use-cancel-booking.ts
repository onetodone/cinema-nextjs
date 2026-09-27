import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/lib/api/errors'
import { bookingsChanged, cancelBooking } from '@/lib/queries/bookings'

const MAX_BUSY_WAIT_MS = 5_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Releasing the seats of an unpaid booking. A booking that another request holds for a moment (`BOOKING_BUSY`) is
 * tried once more after its Retry-After. Canceling is idempotent, so a retry is always safe.
 */
export function useCancelBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bookingId }: { bookingId: string; showtimeId: number }) => {
      try {
        await cancelBooking(bookingId)
      } catch (error) {
        if (!isApiError(error) || error.code !== 'BOOKING_BUSY') throw error
        await sleep(Math.min((error.retryAfter ?? 1) * 1_000, MAX_BUSY_WAIT_MS))
        await cancelBooking(bookingId)
      }
    },
    onSettled: (_data, _error, change) => {
      // A failure may mean the booking moved on (paid, a payment started): refetch it either way.
      bookingsChanged(queryClient, change)
    },
  })
}
