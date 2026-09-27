import { isApiError } from '@/lib/api/errors'
import { errorMessage, errorReference } from '@/lib/api/messages'
import type { Booking } from '@/lib/api/types'
import { instantOf } from '@/lib/time'

/** An unpaid booking that holds its seats: pending (waiting for payment) or processing (a payment is in flight). */
export function isActiveBooking(booking: Pick<Booking, 'status'>): boolean {
  return booking.status === 'pending' || booking.status === 'processing'
}

/** The caller's unpaid booking for a showtime (there is at most one). */
export function activeBookingFor(bookings: readonly Booking[], showtimeId: number): Booking | null {
  return bookings.find((booking) => booking.showtime.id === showtimeId && isActiveBooking(booking)) ?? null
}

/** The unpaid booking whose hold ends first. */
export function nextToExpire(bookings: readonly Booking[]): Booking | null {
  let next: Booking | null = null
  for (const booking of bookings) {
    if (!isActiveBooking(booking)) continue
    if (!next || instantOf(booking.expires_at) < instantOf(next.expires_at)) next = booking
  }
  return next
}

/** What the seat map does with a failed hold (`POST /v1/bookings`). */
export type HoldOutcome =
  /** Someone else holds or bought some of the seats: they leave the selection. */
  | { kind: 'seats-taken'; seatIds: number[] }
  /** The caller already has an unpaid booking for this showtime: continue with it, or cancel it. */
  | { kind: 'active-booking'; bookingId?: string }
  /** The showtime has started or was canceled. */
  | { kind: 'closed' }
  /** The showtime no longer exists. */
  | { kind: 'not-found' }
  /** Some seats are not part of the hall any more: the map is out of date. */
  | { kind: 'unknown-seat' }
  | { kind: 'signed-out' }
  /** Seats or the caller's bookings are locked by another request for a moment: worth one more try. */
  | { kind: 'busy'; retryAfterMs: number }
  | { kind: 'failed'; message: string; reference: string | null }

const BUSY_CODES = new Set(['SEAT_BUSY', 'BOOKING_BUSY', 'IDEMPOTENCY_IN_PROGRESS'])

export function holdOutcome(error: unknown): HoldOutcome {
  if (isApiError(error)) {
    if (error.status === 401) return { kind: 'signed-out' }
    if (BUSY_CODES.has(error.code)) return { kind: 'busy', retryAfterMs: (error.retryAfter ?? 1) * 1000 }
    switch (error.code) {
      case 'SEAT_UNAVAILABLE':
        return { kind: 'seats-taken', seatIds: error.unavailableSeatIds }
      case 'ACTIVE_BOOKING_EXISTS':
        return { kind: 'active-booking', bookingId: error.bookingId }
      case 'SHOWTIME_NOT_BOOKABLE':
        return { kind: 'closed' }
      case 'SHOWTIME_NOT_FOUND':
        return { kind: 'not-found' }
      case 'UNKNOWN_SEAT':
        return { kind: 'unknown-seat' }
    }
  }
  return { kind: 'failed', message: errorMessage(error), reference: errorReference(error) }
}

const BOOKING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether a URL segment can be a booking id (a UUID); anything else is not found without asking the API. */
export function isBookingId(value: string): boolean {
  return BOOKING_ID_PATTERN.test(value)
}
