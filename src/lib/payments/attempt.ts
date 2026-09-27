import { newIdempotencyKey } from '@/lib/idempotency'
import { readSessionValue, removeSessionValue, writeSessionValue } from '@/lib/storage'

// A payment attempt is the Idempotency-Key of one "Pay" and what it paid with. It is stored in this tab's
// sessionStorage **before** the request is sent, so an answer lost to the network, a timeout, or a reload is
// recovered by sending the same attempt again: the API replays the first answer instead of charging twice.
//
// Lifecycle: kept while no final answer has arrived (and for retries the API asks for with the same key); replaced
// when the method or token changes (the API refuses a key reused with another body) and after an answer that
// calls for a new key (a decline, an unavailable provider); cleared on every other final answer.

export interface PaymentAttempt {
  idempotencyKey: string
  method: string
  token: string
}

function storageKey(bookingId: string): string {
  return `cinema:pay:${bookingId}`
}

function isAttempt(value: unknown): value is PaymentAttempt {
  if (typeof value !== 'object' || value === null) return false
  const attempt = value as Partial<PaymentAttempt>
  return (
    typeof attempt.idempotencyKey === 'string' &&
    attempt.idempotencyKey !== '' &&
    typeof attempt.method === 'string' &&
    typeof attempt.token === 'string'
  )
}

/** The attempt of this booking that has not had a final answer yet, if any. */
export function readPaymentAttempt(bookingId: string): PaymentAttempt | null {
  const value = readSessionValue(storageKey(bookingId))
  return isAttempt(value) ? value : null
}

/**
 * The attempt to send for paying with `method` and `token`: the unanswered one when it paid the same way, else a
 * new one. Either way it is stored before this returns, so it survives whatever happens to the request.
 */
export function startPaymentAttempt(bookingId: string, method: string, token: string): PaymentAttempt {
  const current = readPaymentAttempt(bookingId)
  if (current && current.method === method && current.token === token) return current
  const attempt: PaymentAttempt = { idempotencyKey: newIdempotencyKey(), method, token }
  writeSessionValue(storageKey(bookingId), attempt)
  return attempt
}

/** The attempt had a final answer: the next "Pay" starts a new one. */
export function clearPaymentAttempt(bookingId: string): void {
  removeSessionValue(storageKey(bookingId))
}
