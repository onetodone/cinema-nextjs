import { afterEach, describe, expect, it } from 'vitest'
import { clearPaymentAttempt, readPaymentAttempt, startPaymentAttempt } from '@/lib/payments/attempt'
import { BOOKING_ID, OTHER_BOOKING_ID } from '@/test/booking'

afterEach(() => sessionStorage.clear())

describe('payment attempts', () => {
  it('stores a new attempt before it is sent, in this tab', () => {
    const attempt = startPaymentAttempt(BOOKING_ID, 'local', 'tok_success')

    expect(attempt).toEqual({ idempotencyKey: expect.any(String), method: 'local', token: 'tok_success' })
    expect(JSON.parse(sessionStorage.getItem(`cinema:pay:${BOOKING_ID}`)!)).toEqual(attempt)
    expect(readPaymentAttempt(BOOKING_ID)).toEqual(attempt)
    expect(readPaymentAttempt(OTHER_BOOKING_ID)).toBeNull()
  })

  it('sends an unanswered attempt again with its key when paying the same way', () => {
    const first = startPaymentAttempt(BOOKING_ID, 'local', 'tok_success')

    expect(startPaymentAttempt(BOOKING_ID, 'local', 'tok_success').idempotencyKey).toBe(first.idempotencyKey)
  })

  it('starts a new key when the token or method changes (the API refuses a key reused with another body)', () => {
    const first = startPaymentAttempt(BOOKING_ID, 'local', 'tok_declined')
    const second = startPaymentAttempt(BOOKING_ID, 'local', 'tok_success')

    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
    expect(readPaymentAttempt(BOOKING_ID)).toEqual(second)
  })

  it('starts a new key after a final answer', () => {
    const first = startPaymentAttempt(BOOKING_ID, 'local', 'tok_success')
    clearPaymentAttempt(BOOKING_ID)

    expect(readPaymentAttempt(BOOKING_ID)).toBeNull()
    expect(startPaymentAttempt(BOOKING_ID, 'local', 'tok_success').idempotencyKey).not.toBe(first.idempotencyKey)
  })

  it('ignores stored values that are not attempts', () => {
    sessionStorage.setItem(`cinema:pay:${BOOKING_ID}`, '{"idempotencyKey":42}')
    expect(readPaymentAttempt(BOOKING_ID)).toBeNull()
    sessionStorage.setItem(`cinema:pay:${BOOKING_ID}`, 'not json')
    expect(readPaymentAttempt(BOOKING_ID)).toBeNull()
  })
})
