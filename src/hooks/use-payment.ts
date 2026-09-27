import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '@/lib/api/messages'
import type { Booking, BookingStatus } from '@/lib/api/types'
import { answeredOutcome, failedOutcome, keepsAttempt, type ClosedReason, type PayOutcome } from '@/lib/checkout'
import {
  clearPaymentAttempt,
  readPaymentAttempt,
  startPaymentAttempt,
  type PaymentAttempt,
} from '@/lib/payments/attempt'
import { bookingsChanged } from '@/lib/queries/bookings'
import { queryKeys } from '@/lib/queries/keys'
import { payBooking } from '@/lib/queries/payments'

/** How long "busy, try again" answers are retried with the same key before the viewer is asked to. */
const RETRY_BUDGET_MS = 30_000
const MAX_RETRY_WAIT_MS = 5_000

/** What the checkout tells the viewer about the last payment attempt. */
export type PaymentFeedback =
  | { kind: 'declined'; message: string }
  | { kind: 'provider-unavailable'; retryAfterSeconds?: number }
  | { kind: 'interrupted'; message: string; reference: string | null }
  | { kind: 'method-unavailable' }
  | { kind: 'failed'; message: string; reference: string | null }
  /** A payment that was in flight ended without a charge: the booking is pending again. */
  | { kind: 'not-completed' }
  /** The charge landed after the hold had stopped waiting for it, and was refunded. */
  | { kind: 'refunded' }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Sends an attempt, and sends it again (same key) while the API answers that it is busy with it, for a while. */
async function sendUntilAnswered(bookingId: string, attempt: PaymentAttempt): Promise<PayOutcome> {
  const giveUpAt = Date.now() + RETRY_BUDGET_MS
  for (;;) {
    let outcome: PayOutcome
    let failure: unknown
    try {
      outcome = answeredOutcome(await payBooking(bookingId, attempt))
    } catch (error) {
      failure = error
      outcome = failedOutcome(error)
    }
    if (outcome.kind !== 'retry') return outcome
    if (Date.now() + outcome.afterMs > giveUpAt) {
      return { kind: 'interrupted', message: errorMessage(failure), reference: null }
    }
    await sleep(Math.min(outcome.afterMs, MAX_RETRY_WAIT_MS))
  }
}

/**
 * Paying for a booking at checkout. Each "Pay" is an attempt with its own Idempotency-Key, stored before it is sent
 * (see lib/payments/attempt): an attempt that got no final answer — the connection dropped, the page reloaded — is
 * sent again as it was by `resume`, so the viewer sees what became of it and is never charged twice.
 *
 * The booking in the query cache follows every answer; the checkout's screen is derived from it (see
 * `checkoutScreen`).
 */
export function usePayment(booking: Booking) {
  const queryClient = useQueryClient()
  const bookingId = booking.id
  const showtimeId = booking.showtime.id

  /** `resumed`: an earlier attempt of this tab is being sent again to learn its outcome. */
  const [paying, setPaying] = useState<'new' | 'resumed' | null>(null)
  const [feedback, setFeedback] = useState<PaymentFeedback | null>(null)
  /** An answer said the booking can no longer be paid for; the booking query catches up on its own. */
  const [closedReason, setClosedReason] = useState<ClosedReason | null>(null)
  const running = useRef(false)

  // A payment in flight that ends with the booking pending again was not charged: say so (adjusted during render,
  // from the status the booking query brings).
  const [seenStatus, setSeenStatus] = useState<BookingStatus>(booking.status)
  if (booking.status !== seenStatus) {
    setSeenStatus(booking.status)
    if (seenStatus === 'processing' && booking.status === 'pending') setFeedback({ kind: 'not-completed' })
  }

  /** Refresh what the payment changed, here and in the other tabs; `keepBooking` when the answer carried it. */
  function changed(keepBooking = false) {
    bookingsChanged(queryClient, { bookingId, showtimeId }, { keepBooking })
  }

  function apply(outcome: PayOutcome) {
    const key = queryKeys.private.booking(bookingId)
    switch (outcome.kind) {
      case 'paid':
        queryClient.setQueryData(key, outcome.booking)
        changed(true)
        return
      case 'processing':
        // PAYMENT_IN_PROGRESS carries no booking: show it in flight until the next poll brings the real one.
        queryClient.setQueryData<Booking>(
          key,
          (current) => outcome.booking ?? (current ? { ...current, status: 'processing' } : current),
        )
        changed(outcome.booking !== undefined)
        return
      case 'already-paid':
        changed()
        return
      case 'closed':
        setClosedReason(outcome.reason)
        if (outcome.reason === 'refunded') setFeedback({ kind: 'refunded' })
        changed()
        return
      case 'declined':
      case 'provider-unavailable':
        // The booking is pending again, as the cache shows it.
        setFeedback(outcome)
        changed(true)
        return
      case 'method-unavailable':
        setFeedback(outcome)
        void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.paymentMethods() })
        return
      case 'interrupted':
        setFeedback(outcome)
        // The payment may have started: the booking shows whether it is in flight.
        void queryClient.invalidateQueries({ queryKey: key })
        return
      case 'failed':
        setFeedback(outcome)
        return
      case 'retry':
      case 'signed-out':
        // `retry` does not get here (sendUntilAnswered); after `signed-out` the page's guard asks to sign in.
        return
    }
  }

  async function run(attempt: PaymentAttempt, mode: 'new' | 'resumed') {
    if (running.current) return
    running.current = true
    setPaying(mode)
    setFeedback(null)
    try {
      const outcome = await sendUntilAnswered(bookingId, attempt)
      if (!keepsAttempt(outcome)) clearPaymentAttempt(bookingId)
      apply(outcome)
    } finally {
      running.current = false
      setPaying(null)
    }
  }

  return {
    paying,
    feedback,
    closedReason,
    /** Pays with a method and its token: a new attempt, or the unanswered one if it paid the same way. */
    pay: (method: string, token: string) => void run(startPaymentAttempt(bookingId, method, token), 'new'),
    /** Sends this tab's unanswered attempt again, if there is one; returns whether there was. */
    resume: (): boolean => {
      const attempt = readPaymentAttempt(bookingId)
      if (attempt) void run(attempt, 'resumed')
      return attempt !== null
    },
    /** Forgets an unanswered attempt that no longer matters (the booking is paid or closed). */
    discardAttempt: () => clearPaymentAttempt(bookingId),
    dismissFeedback: () => setFeedback(null),
  }
}
