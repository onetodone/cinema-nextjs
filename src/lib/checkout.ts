import { isApiError } from '@/lib/api/errors'
import { errorMessage, errorReference } from '@/lib/api/messages'
import type { Booking, BookingStatus } from '@/lib/api/types'
import type { PayAnswer } from '@/lib/queries/payments'

// The checkout's decisions, kept apart from the UI: what an answer to "Pay" means, and which screen a booking is on.

/** Why a booking can no longer be paid for. */
export type ClosedReason = 'expired' | 'canceled' | 'refunded'

export type PayOutcome =
  | { kind: 'paid'; booking: Booking }
  /** The payment is in flight (202, or another payment of the booking): follow the booking until it settles. */
  | { kind: 'processing'; booking?: Booking }
  /** The API is busy with this booking or this key: send the same attempt again after a moment. */
  | { kind: 'retry'; afterMs: number }
  /** The provider declined; nothing was charged and the booking is pending again. A new attempt gets a new key. */
  | { kind: 'declined'; message: string }
  /** The provider refused the request; nothing was charged. A new attempt (new key) may work after a while. */
  | { kind: 'provider-unavailable'; retryAfterSeconds?: number }
  /** No usable answer (the connection dropped, a timeout, a server error): sending the same attempt again is safe. */
  | { kind: 'interrupted'; message: string; reference: string | null }
  | { kind: 'already-paid' }
  | { kind: 'closed'; reason: ClosedReason }
  /** The method is unknown or was switched off: pick another. */
  | { kind: 'method-unavailable' }
  | { kind: 'signed-out' }
  | { kind: 'failed'; message: string; reference: string | null }

/** Whether the attempt's key is sent again after this outcome; every other outcome ends the attempt. */
export function keepsAttempt(outcome: PayOutcome): boolean {
  return outcome.kind === 'retry' || outcome.kind === 'interrupted'
}

/** What a successful answer (200 or 202) means. */
export function answeredOutcome({ accepted, result }: PayAnswer): PayOutcome {
  if (!accepted && result.booking.status === 'paid') return { kind: 'paid', booking: result.booking }
  return { kind: 'processing', booking: result.booking }
}

const DECLINE_MESSAGES: Record<string, string> = {
  card_declined: 'The card was declined.',
  insufficient_funds: 'The card was declined for insufficient funds.',
  expired_card: 'The card has expired.',
  invalid_token: 'The card details weren’t accepted.',
}

/** "The card has expired. Nothing was charged." for a `decline_code`. */
export function declineMessage(declineCode: string | undefined): string {
  const reason = (declineCode && DECLINE_MESSAGES[declineCode]) || 'The payment was declined.'
  return `${reason} Nothing was charged — try another card.`
}

/** What a failed answer means. */
export function failedOutcome(error: unknown): PayOutcome {
  if (!isApiError(error)) return { kind: 'failed', message: errorMessage(error), reference: null }
  switch (error.code) {
    case 'PAYMENT_DECLINED':
      return { kind: 'declined', message: declineMessage(error.declineCode) }
    case 'PAYMENT_IN_PROGRESS':
      return { kind: 'processing' }
    case 'BOOKING_ALREADY_PAID':
      return { kind: 'already-paid' }
    case 'BOOKING_CANCELED':
      return { kind: 'closed', reason: 'canceled' }
    case 'BOOKING_EXPIRED':
      return { kind: 'closed', reason: 'expired' }
    case 'PAYMENT_REFUNDED':
      return { kind: 'closed', reason: 'refunded' }
    case 'BOOKING_BUSY':
    case 'IDEMPOTENCY_IN_PROGRESS':
      return { kind: 'retry', afterMs: (error.retryAfter ?? 1) * 1000 }
    case 'PAYMENT_METHOD_UNAVAILABLE':
      return { kind: 'method-unavailable' }
    case 'PAYMENT_PROVIDER_UNAVAILABLE':
      return { kind: 'provider-unavailable', retryAfterSeconds: error.retryAfter }
  }
  if (error.status === 401) return { kind: 'signed-out' }
  // The answer was lost or broken, so the payment may or may not have gone through: the same key finds out safely.
  if (error.status === 0 || error.status >= 500) {
    return { kind: 'interrupted', message: errorMessage(error), reference: errorReference(error) }
  }
  return { kind: 'failed', message: errorMessage(error), reference: errorReference(error) }
}

/** Below this much time left, the countdown warns. */
export const HOLD_WARNING_MS = 2 * 60_000

export type CheckoutScreen =
  { name: 'ready' } | { name: 'processing' } | { name: 'paid' } | { name: 'closed'; reason: ClosedReason }

/**
 * Which screen the checkout shows. The booking's status decides, with two refinements: a pending hold whose time is
 * up is closed at once (the API's worker releases it within seconds, and the API already refuses to take a payment
 * for it), and an answer that said the booking is closed wins over a pending status the query has not caught up
 * with yet. A refund with the hold still running leaves the booking payable.
 */
export function checkoutScreen({
  status,
  remainingMs,
  closedReason,
}: {
  status: BookingStatus
  remainingMs: number | null
  closedReason: ClosedReason | null
}): CheckoutScreen {
  if (status === 'paid') return { name: 'paid' }
  if (status === 'processing') return { name: 'processing' }
  if (status === 'canceled') return { name: 'closed', reason: closedReason === 'refunded' ? 'refunded' : 'canceled' }
  if (status === 'expired' || remainingMs === 0) {
    return { name: 'closed', reason: closedReason === 'refunded' ? 'refunded' : 'expired' }
  }
  if (closedReason === 'expired' || closedReason === 'canceled') return { name: 'closed', reason: closedReason }
  return { name: 'ready' }
}

/** After this long in flight, the checkout stops following a payment and says it will settle later. */
export const PROCESSING_GIVE_UP_MS = 3 * 60_000

/**
 * How long to wait before asking again about a booking whose payment is in flight: every 2 s at first, backing off
 * to every 10 s, and not at all after PROCESSING_GIVE_UP_MS (the API's worker settles such payments within about
 * 2.5 minutes by default).
 */
export function processingPollDelay(elapsedMs: number): number | false {
  if (elapsedMs >= PROCESSING_GIVE_UP_MS) return false
  if (elapsedMs < 10_000) return 2_000
  if (elapsedMs < 30_000) return 5_000
  return 10_000
}
