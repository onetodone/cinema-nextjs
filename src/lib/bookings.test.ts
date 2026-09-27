import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { activeBookingFor, holdOutcome, isBookingId, nextToExpire } from '@/lib/bookings'
import { makeBooking } from '@/test/booking'

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[1]> = {}) =>
  new ApiError(code, { status, code, ...extra })

describe('active bookings', () => {
  const paid = makeBooking({ id: 'paid', status: 'paid' })
  const later = makeBooking({ id: 'later', expires_at: '2999-01-01T10:10:00Z' })
  const sooner = makeBooking({
    id: 'sooner',
    status: 'processing',
    expires_at: '2999-01-01T10:05:00Z',
    showtime: { ...makeBooking().showtime, id: 8 },
  })

  it('finds the unpaid booking of a showtime', () => {
    expect(activeBookingFor([paid, later, sooner], 7)?.id).toBe('later')
    expect(activeBookingFor([paid, later, sooner], 8)?.id).toBe('sooner')
    expect(activeBookingFor([paid], 7)).toBeNull()
  })

  it('picks the hold that runs out first', () => {
    expect(nextToExpire([paid, later, sooner])?.id).toBe('sooner')
    expect(nextToExpire([paid])).toBeNull()
  })
})

describe('holdOutcome', () => {
  it('maps every conflict of POST /v1/bookings', () => {
    expect(holdOutcome(apiError(409, 'SEAT_UNAVAILABLE', { unavailableSeatIds: [61, 62] }))).toEqual({
      kind: 'seats-taken',
      seatIds: [61, 62],
    })
    expect(holdOutcome(apiError(409, 'ACTIVE_BOOKING_EXISTS', { bookingId: 'b-1' }))).toEqual({
      kind: 'active-booking',
      bookingId: 'b-1',
    })
    expect(holdOutcome(apiError(409, 'ACTIVE_BOOKING_EXISTS'))).toEqual({ kind: 'active-booking' })
    expect(holdOutcome(apiError(409, 'SHOWTIME_NOT_BOOKABLE'))).toEqual({ kind: 'closed' })
    expect(holdOutcome(apiError(404, 'SHOWTIME_NOT_FOUND'))).toEqual({ kind: 'not-found' })
    expect(holdOutcome(apiError(422, 'UNKNOWN_SEAT'))).toEqual({ kind: 'unknown-seat' })
    expect(holdOutcome(apiError(401, 'UNAUTHENTICATED'))).toEqual({ kind: 'signed-out' })
  })

  it('treats busy answers as worth one more try after Retry-After', () => {
    expect(holdOutcome(apiError(409, 'SEAT_BUSY', { retryAfter: 2 }))).toEqual({ kind: 'busy', retryAfterMs: 2000 })
    expect(holdOutcome(apiError(409, 'BOOKING_BUSY'))).toEqual({ kind: 'busy', retryAfterMs: 1000 })
    expect(holdOutcome(apiError(409, 'IDEMPOTENCY_IN_PROGRESS', { retryAfter: 1 }))).toEqual({
      kind: 'busy',
      retryAfterMs: 1000,
    })
  })

  it('says what went wrong otherwise, with a reference for server errors', () => {
    expect(holdOutcome(apiError(429, 'RATE_LIMITED', { retryAfter: 30 }))).toEqual({
      kind: 'failed',
      message: 'Too many attempts. Please try again in 30 seconds.',
      reference: null,
    })
    expect(holdOutcome(apiError(500, 'INTERNAL', { requestId: 'req-9' }))).toMatchObject({
      kind: 'failed',
      reference: 'req-9',
    })
    expect(holdOutcome(apiError(0, 'NETWORK'))).toMatchObject({ kind: 'failed', message: /Can’t reach/ })
  })
})

describe('isBookingId', () => {
  it('accepts UUIDs only', () => {
    expect(isBookingId('0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a77')).toBe(true)
    expect(isBookingId('0199A1F0-7C1E-7D2A-9B3E-5F0C2D1E4A77')).toBe(true)
    expect(isBookingId('42')).toBe(false)
    expect(isBookingId('0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a7')).toBe(false)
  })
})
