import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import {
  answeredOutcome,
  checkoutScreen,
  declineMessage,
  failedOutcome,
  keepsAttempt,
  processingPollDelay,
  PROCESSING_GIVE_UP_MS,
} from '@/lib/checkout'
import { makeBooking, paymentResult } from '@/test/booking'

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[1]> = {}) =>
  new ApiError(code, { status, code, ...extra })

describe('pay outcomes', () => {
  it('200 is paid; 202 is in flight', () => {
    const paid = makeBooking({ status: 'paid' })
    expect(answeredOutcome({ result: paymentResult(paid, 'succeeded'), accepted: false, replayed: false })).toEqual({
      kind: 'paid',
      booking: paid,
    })
    const processing = makeBooking({ status: 'processing' })
    expect(answeredOutcome({ result: paymentResult(processing, 'pending'), accepted: true, replayed: true })).toEqual({
      kind: 'processing',
      booking: processing,
    })
  })

  it('maps every failed answer of POST /v1/bookings/{id}/payments', () => {
    expect(failedOutcome(apiError(402, 'PAYMENT_DECLINED', { declineCode: 'insufficient_funds' }))).toEqual({
      kind: 'declined',
      message: 'The card was declined for insufficient funds. Nothing was charged — try another card.',
    })
    expect(failedOutcome(apiError(409, 'PAYMENT_IN_PROGRESS'))).toEqual({ kind: 'processing' })
    expect(failedOutcome(apiError(409, 'BOOKING_ALREADY_PAID'))).toEqual({ kind: 'already-paid' })
    expect(failedOutcome(apiError(409, 'BOOKING_CANCELED'))).toEqual({ kind: 'closed', reason: 'canceled' })
    expect(failedOutcome(apiError(409, 'PAYMENT_REFUNDED'))).toEqual({ kind: 'closed', reason: 'refunded' })
    expect(failedOutcome(apiError(410, 'BOOKING_EXPIRED'))).toEqual({ kind: 'closed', reason: 'expired' })
    expect(failedOutcome(apiError(409, 'BOOKING_BUSY', { retryAfter: 2 }))).toEqual({ kind: 'retry', afterMs: 2000 })
    expect(failedOutcome(apiError(409, 'IDEMPOTENCY_IN_PROGRESS', { retryAfter: 1 }))).toEqual({
      kind: 'retry',
      afterMs: 1000,
    })
    expect(failedOutcome(apiError(422, 'PAYMENT_METHOD_UNAVAILABLE'))).toEqual({ kind: 'method-unavailable' })
    expect(failedOutcome(apiError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', { retryAfter: 5 }))).toEqual({
      kind: 'provider-unavailable',
      retryAfterSeconds: 5,
    })
    expect(failedOutcome(apiError(401, 'UNAUTHENTICATED'))).toEqual({ kind: 'signed-out' })
    expect(failedOutcome(apiError(0, 'NETWORK'))).toMatchObject({ kind: 'interrupted', reference: null })
    expect(failedOutcome(apiError(500, 'INTERNAL', { requestId: 'req-7' }))).toMatchObject({
      kind: 'interrupted',
      reference: 'req-7',
    })
    expect(failedOutcome(apiError(422, 'IDEMPOTENCY_KEY_REUSED'))).toMatchObject({ kind: 'failed' })
  })

  it('sends the same key again only when the answer was lost or asked for a retry', () => {
    expect(keepsAttempt({ kind: 'retry', afterMs: 1000 })).toBe(true)
    expect(keepsAttempt({ kind: 'interrupted', message: '', reference: null })).toBe(true)
    expect(keepsAttempt({ kind: 'declined', message: '' })).toBe(false)
    expect(keepsAttempt({ kind: 'provider-unavailable' })).toBe(false)
    expect(keepsAttempt({ kind: 'processing' })).toBe(false)
    expect(keepsAttempt({ kind: 'signed-out' })).toBe(false)
  })

  it('explains each decline code', () => {
    expect(declineMessage('card_declined')).toBe('The card was declined. Nothing was charged — try another card.')
    expect(declineMessage('expired_card')).toMatch(/^The card has expired\./)
    expect(declineMessage('invalid_token')).toMatch(/^The card details weren’t accepted\./)
    expect(declineMessage('something_new')).toMatch(/^The payment was declined\./)
    expect(declineMessage(undefined)).toMatch(/^The payment was declined\./)
  })
})

describe('checkoutScreen', () => {
  const screen = (status: Parameters<typeof checkoutScreen>[0]['status'], remainingMs: number | null = 60_000) =>
    checkoutScreen({ status, remainingMs, closedReason: null })

  it('follows the booking status', () => {
    expect(screen('pending')).toEqual({ name: 'ready' })
    expect(screen('pending', null)).toEqual({ name: 'ready' })
    expect(screen('processing', 0)).toEqual({ name: 'processing' })
    expect(screen('paid', 0)).toEqual({ name: 'paid' })
    expect(screen('expired')).toEqual({ name: 'closed', reason: 'expired' })
    expect(screen('canceled')).toEqual({ name: 'closed', reason: 'canceled' })
  })

  it('closes a pending hold whose time is up before the API says so', () => {
    expect(screen('pending', 0)).toEqual({ name: 'closed', reason: 'expired' })
  })

  it('trusts an answer that closed the booking over a pending status not refetched yet', () => {
    expect(checkoutScreen({ status: 'pending', remainingMs: 60_000, closedReason: 'expired' })).toEqual({
      name: 'closed',
      reason: 'expired',
    })
    expect(checkoutScreen({ status: 'expired', remainingMs: null, closedReason: 'refunded' })).toEqual({
      name: 'closed',
      reason: 'refunded',
    })
    // A refund while the hold still runs leaves the booking payable.
    expect(checkoutScreen({ status: 'pending', remainingMs: 60_000, closedReason: 'refunded' })).toEqual({
      name: 'ready',
    })
    expect(checkoutScreen({ status: 'paid', remainingMs: null, closedReason: 'expired' })).toEqual({ name: 'paid' })
  })
})

describe('processingPollDelay', () => {
  it('asks often at first, then backs off, then stops', () => {
    expect(processingPollDelay(0)).toBe(2_000)
    expect(processingPollDelay(9_999)).toBe(2_000)
    expect(processingPollDelay(10_000)).toBe(5_000)
    expect(processingPollDelay(30_000)).toBe(10_000)
    expect(processingPollDelay(PROCESSING_GIVE_UP_MS - 1)).toBe(10_000)
    expect(processingPollDelay(PROCESSING_GIVE_UP_MS)).toBe(false)
  })
})
