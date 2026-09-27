import { HttpResponse } from 'msw'
import type { Booking, PaymentResult, SeatStatus } from '@/lib/api/types'

// Fixtures for booking and payment tests: bookings as the API sends them, and problem answers for MSW handlers.

export const BOOKING_ID = '0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a77'
export const OTHER_BOOKING_ID = '0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a78'

/** A pending booking of seats A4 and A5 of showtime 7, created now, held for 15 minutes. */
export function makeBooking(overrides: Partial<Booking> = {}): Booking {
  const now = Date.now()
  return {
    id: BOOKING_ID,
    status: 'pending',
    showtime: {
      id: 7,
      movie: { id: 1, title: 'Orbit of Glass', duration_min: 142, age_rating: 'PG-13' },
      hall: { id: 1, name: 'Hall 1' },
      starts_at: '2999-01-01T19:30:00+02:00',
    },
    seats: [
      { id: 4, row: 'A', number: 4, type: 'standard', price_cents: 1100 },
      { id: 5, row: 'A', number: 5, type: 'standard', price_cents: 1100 },
    ],
    total_cents: 2200,
    currency: 'USD',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 15 * 60_000).toISOString(),
    ...overrides,
  }
}

export function paymentResult(booking: Booking, status: PaymentResult['payment']['status']): PaymentResult {
  return {
    payment: {
      id: '0199a1f0-8d2f-7e3b-8c4f-6a1d3e2f5b88',
      status,
      payment_method: 'local',
      amount_cents: booking.total_cents,
      currency: booking.currency,
      created_at: booking.created_at,
    },
    booking,
  }
}

/** An RFC 9457 problem answer, with extension members (`unavailable_seat_ids`, `decline_code`, …) and headers. */
export function problemResponse(
  status: number,
  code: string,
  { extra = {}, headers = {} }: { extra?: Record<string, unknown>; headers?: Record<string, string> } = {},
) {
  return HttpResponse.json(
    { type: 'about:blank', title: code, status, code, detail: code.toLowerCase(), request_id: 'req-1', ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json', ...headers } },
  )
}

export type { SeatStatus }
