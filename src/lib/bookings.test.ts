import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import {
  activeBookingFor,
  awaitsSettlement,
  groupBookingHistory,
  holdOutcome,
  isBookingId,
  nextToExpire,
} from '@/lib/bookings'
import { makeBooking } from '@/test/booking'

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[1]> = {}) =>
  new ApiError(code, { status, code, ...extra })

const showtimeAt = (id: number, startsAt: string) => ({ ...makeBooking().showtime, id, starts_at: startsAt })

describe('booking history', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')
  const soon = makeBooking({ id: 'soon', status: 'paid', showtime: showtimeAt(1, '2026-09-27T19:30:00+02:00') })
  const later = makeBooking({ id: 'later', status: 'paid', showtime: showtimeAt(2, '2026-10-02T18:00:00+02:00') })
  const started = makeBooking({ id: 'started', status: 'paid', showtime: showtimeAt(3, '2026-09-27T13:30:00+02:00') })
  const expired = makeBooking({
    id: 'expired',
    status: 'expired',
    showtime: showtimeAt(4, '2026-10-01T18:00:00+02:00'),
  })
  const canceled = makeBooking({ id: 'canceled', status: 'canceled' })

  it('puts paid tickets still to come first, the soonest first; the rest keeps the list order', () => {
    const { upcoming, past } = groupBookingHistory([later, started, expired, soon, canceled], now)

    expect(upcoming.map((booking) => booking.id)).toEqual(['soon', 'later'])
    // 13:30 at +02:00 is 11:30 UTC: started. An expired hold is past even when its showtime is not.
    expect(past.map((booking) => booking.id)).toEqual(['started', 'expired', 'canceled'])
  })

  it('counts a booking seen on two pages once', () => {
    const { upcoming, past } = groupBookingHistory([soon, canceled, soon, canceled], now)
    expect(upcoming).toHaveLength(1)
    expect(past).toHaveLength(1)
  })
})

describe('awaitsSettlement', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')

  it('waits for payments in flight and for holds whose time is up', () => {
    const live = makeBooking({ expires_at: '2026-09-27T12:10:00Z' })
    const overdue = makeBooking({ expires_at: '2026-09-27T12:00:00Z' })
    const processing = makeBooking({ status: 'processing', expires_at: '2026-09-27T12:10:00Z' })

    expect(awaitsSettlement([live], now)).toBe(false)
    expect(awaitsSettlement([live, overdue], now)).toBe(true)
    expect(awaitsSettlement([processing], now)).toBe(true)
    expect(awaitsSettlement([], now)).toBe(false)
  })
})

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
