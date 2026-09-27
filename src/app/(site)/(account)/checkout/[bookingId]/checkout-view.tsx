'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertCircleIcon,
  BanIcon,
  CheckCircle2Icon,
  HourglassIcon,
  Loader2Icon,
  RotateCwIcon,
  TimerOffIcon,
} from 'lucide-react'
import { isApiError } from '@/lib/api/errors'
import { errorMessage } from '@/lib/api/messages'
import type { Booking } from '@/lib/api/types'
import { isBookingId } from '@/lib/bookings'
import { checkoutScreen, processingPollDelay, PROCESSING_GIVE_UP_MS, type ClosedReason } from '@/lib/checkout'
import { formatMoney } from '@/lib/money'
import { bookingQuery, refreshAfterBookingsChange } from '@/lib/queries/bookings'
import { paymentMethodsQuery } from '@/lib/queries/payments'
import { useCancelBooking } from '@/hooks/use-cancel-booking'
import { useCountdown } from '@/hooks/use-countdown'
import { useFocusOnChange } from '@/hooks/use-focus-on-change'
import { usePayment, type PaymentFeedback } from '@/hooks/use-payment'
import { BookingNotFound } from '@/components/bookings/booking-not-found'
import { BookingSummary } from '@/components/checkout/booking-summary'
import { CancelHoldButton } from '@/components/checkout/cancel-hold-button'
import { HoldTimer } from '@/components/checkout/hold-timer'
import { firstSupportedMethod, paymentMethodEntry, PaymentMethodPicker } from '@/components/checkout/payment-methods'
import { BackLink } from '@/components/layout/back-link'
import { LoadError } from '@/components/layout/load-error'
import { Notice } from '@/components/layout/notice'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CheckoutSkeleton } from './checkout-skeleton'

/** The checkout of one booking, for its signed-in owner (behind AuthGuard). */
export function CheckoutView({ bookingId }: { bookingId: string }) {
  if (!isBookingId(bookingId)) return <BookingNotFound />
  return <CheckoutLoader bookingId={bookingId} />
}

function CheckoutLoader({ bookingId }: { bookingId: string }) {
  // While a payment is in flight, the booking is asked about again and again, less often as time passes.
  const processingSince = useRef<number | null>(null)
  const {
    data: booking,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    ...bookingQuery(bookingId),
    refetchInterval: (query) => {
      if (query.state.data?.status !== 'processing') {
        processingSince.current = null
        return false
      }
      processingSince.current ??= Date.now()
      return processingPollDelay(Date.now() - processingSince.current)
    },
  })

  if (booking) return <Checkout booking={booking} />
  if (isApiError(error) && error.status === 404) return <BookingNotFound />
  if (error) {
    return (
      <LoadError what="this booking" error={error} onRetry={() => void refetch()} retrying={isRefetching} pageHeading />
    )
  }
  return <CheckoutSkeleton />
}

function Checkout({ booking }: { booking: Booking }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const payment = usePayment(booking)
  const remaining = useCountdown(booking.status === 'pending' ? booking.expires_at : null, booking.created_at)
  const screen = checkoutScreen({ status: booking.status, remainingMs: remaining, closedReason: payment.closedReason })
  const showtimeHref = `/showtimes/${booking.showtime.id}`
  // "Pay" (or whatever had focus in the payment panel) goes away when the screen changes: focus goes to the heading.
  const headingRef = useFocusOnChange<HTMLHeadingElement>(screen.name)

  // An attempt that got no answer before a reload (or a dropped connection) is sent again as it was, so the viewer
  // sees what became of it. A booking that is paid or closed has nothing left to find out.
  const resumeUnansweredAttempt = useEffectEvent(() => {
    if (booking.status === 'pending' || booking.status === 'processing') payment.resume()
    else payment.discardAttempt()
  })
  useEffect(() => resumeUnansweredAttempt(), [booking.id])

  // Paid: on to the ticket. The toast only for a payment made here, not for a paid booking opened again.
  const wasUnpaid = useRef(false)
  const openTicket = useEffectEvent(() => {
    payment.discardAttempt()
    if (wasUnpaid.current) toast.success('Payment complete. Enjoy the movie!', { id: 'paid' })
    router.replace(`/bookings/${booking.id}`)
  })
  useEffect(() => {
    if (screen.name === 'paid') openTicket()
    else wasUnpaid.current = true
  }, [screen.name])

  // The hold ran out by the clock: ask the API (its worker releases the seats within seconds), and let the seat
  // map and the header catch up.
  const expiredByClock = booking.status === 'pending' && remaining === 0
  useEffect(() => {
    if (expiredByClock) refreshAfterBookingsChange(queryClient, { showtimeId: booking.showtime.id })
  }, [expiredByClock, queryClient, booking.showtime.id])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <BackLink href={showtimeHref}>{screen.name === 'ready' ? 'Back to seats' : 'Showtime'}</BackLink>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Checkout
        </h1>
      </div>

      {screen.name === 'ready' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <div className="flex flex-col gap-6">
            <HoldTimer remainingMs={remaining} createdAt={booking.created_at} expiresAt={booking.expires_at} />
            <BookingSummary booking={booking} />
          </div>
          <PaymentPanel booking={booking} payment={payment} />
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          {screen.name === 'processing' ? (
            <ProcessingNotice bookingId={booking.id} />
          ) : screen.name === 'paid' ? (
            <Notice tone="highlight" icon={CheckCircle2Icon} title="Payment complete">
              Opening your ticket…
            </Notice>
          ) : (
            <ClosedNotice reason={screen.reason} showtimeHref={showtimeHref} />
          )}
          <BookingSummary booking={booking} />
        </div>
      )}
    </div>
  )
}

type Payment = ReturnType<typeof usePayment>

function PaymentPanel({ booking, payment }: { booking: Booking; payment: Payment }) {
  const router = useRouter()
  const cancel = useCancelBooking()
  const methodsQuery = useQuery(paymentMethodsQuery())
  const methods = methodsQuery.data ?? []
  const [choice, setChoice] = useState<{ methodId: string; token: string } | null>(null)

  // The viewer's choice while it is still offered; else the first method this client supports, with its default.
  const chosen = choice && methods.some((method) => method.id === choice.methodId) ? choice : null
  const methodId = chosen?.methodId ?? firstSupportedMethod(methods)?.id ?? methods[0]?.id ?? null
  const entry = methodId === null ? null : paymentMethodEntry(methodId)
  const token = chosen?.token ?? entry?.initialToken ?? ''
  const busy = payment.paying !== null || cancel.isPending
  const canPay = entry !== null && methodId !== null && token !== '' && !busy

  async function releaseSeats(): Promise<boolean> {
    try {
      await cancel.mutateAsync({ bookingId: booking.id, showtimeId: booking.showtime.id })
    } catch (error) {
      toast.error(`Couldn’t release your seats. ${errorMessage(error)}`, { id: 'cancel-failed' })
      return false
    }
    payment.discardAttempt()
    toast.success('Your seats were released.', { id: 'released' })
    router.push(`/showtimes/${booking.showtime.id}`)
    return true
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>
          <h2>Payment</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {methodsQuery.isPending ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-40" />
          </div>
        ) : methodsQuery.isError && methods.length === 0 ? (
          <LoadError
            what="the payment methods"
            error={methodsQuery.error}
            onRetry={() => void methodsQuery.refetch()}
            retrying={methodsQuery.isRefetching}
          />
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payment method is available right now. Please try later.</p>
        ) : (
          <PaymentMethodPicker
            methods={methods}
            methodId={methodId}
            onMethodChange={(next) =>
              setChoice({ methodId: next, token: paymentMethodEntry(next)?.initialToken ?? '' })
            }
            token={token}
            onTokenChange={(next) => methodId !== null && setChoice({ methodId, token: next })}
            disabled={busy}
          />
        )}

        {payment.feedback ? <FeedbackMessage feedback={payment.feedback} /> : null}

        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="h-11 w-full text-base"
            disabled={!canPay}
            onClick={() => methodId !== null && payment.pay(methodId, token)}
          >
            {payment.paying ? (
              <>
                <Loader2Icon data-icon="inline-start" className="motion-safe:animate-spin" aria-hidden="true" />
                {payment.paying === 'resumed' ? 'Checking your payment…' : 'Paying…'}
              </>
            ) : payment.feedback?.kind === 'interrupted' ? (
              'Retry payment'
            ) : (
              `Pay ${formatMoney(booking.total_cents, booking.currency)}`
            )}
          </Button>
          <CancelHoldButton booking={booking} disabled={busy} pending={cancel.isPending} onConfirm={releaseSeats} />
        </div>
      </CardContent>
    </Card>
  )
}

function FeedbackMessage({ feedback }: { feedback: PaymentFeedback }) {
  let title: string
  let text: string
  let reference: string | null = null
  switch (feedback.kind) {
    case 'declined':
      title = 'Payment declined'
      text = feedback.message
      break
    case 'provider-unavailable':
      title = 'The payment provider is unavailable'
      text = `Nothing was charged. Please try again${
        feedback.retryAfterSeconds ? ` in ${feedback.retryAfterSeconds} seconds` : ' in a moment'
      }.`
      break
    case 'interrupted':
      title = 'We didn’t hear back about your payment'
      text = `${feedback.message} Retrying is safe: you won’t be charged twice.`
      reference = feedback.reference
      break
    case 'method-unavailable':
      title = 'This payment method is no longer available'
      text = 'Please choose another one.'
      break
    case 'failed':
      title = 'The payment didn’t go through'
      text = feedback.message
      reference = feedback.reference
      break
    case 'not-completed':
      title = 'The payment didn’t go through'
      text = 'The payment provider didn’t complete it, and nothing was charged. You can try again.'
      break
    case 'refunded':
      title = 'Your payment was refunded'
      text = 'It arrived after the hold had stopped waiting for it, so the money went back.'
      break
  }
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">
          {text}
          {reference ? ` Reference: ${reference}` : null}
        </p>
      </div>
    </div>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return <Loader2Icon className={cn(className, 'motion-safe:animate-spin')} aria-hidden />
}

/** A payment in flight: the booking is polled (see CheckoutLoader); after a few minutes, the checkout stops waiting. */
function ProcessingNotice({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), PROCESSING_GIVE_UP_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!slow) {
    return (
      <Notice tone="highlight" icon={SpinnerIcon} title="Confirming your payment…">
        This usually takes a few seconds, and your seats stay yours meanwhile. You can leave this page: the booking
        updates by itself.
      </Notice>
    )
  }
  return (
    <Notice
      icon={HourglassIcon}
      title="Your payment is taking longer than usual"
      actions={
        <Button
          variant="outline"
          size="lg"
          onClick={() => void queryClient.invalidateQueries({ queryKey: bookingQuery(bookingId).queryKey })}
        >
          <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
          Check again
        </Button>
      }
    >
      The payment provider hasn&apos;t confirmed it yet. It will be settled within a few minutes, and you won&apos;t be
      charged twice. Your seats stay yours until then.
    </Notice>
  )
}

const CLOSED_COPY: Record<ClosedReason, { title: string; text: string }> = {
  expired: {
    title: 'Your hold has expired',
    text: 'The seats were released, so someone else may book them now. You can pick seats again.',
  },
  canceled: {
    title: 'This hold was canceled',
    text: 'Its seats were released. You can pick seats again.',
  },
  refunded: {
    title: 'Your payment was refunded',
    text: 'It arrived after the hold had ended, so the money went back and the seats were released.',
  },
}

function ClosedNotice({ reason, showtimeHref }: { reason: ClosedReason; showtimeHref: string }) {
  const { title, text } = CLOSED_COPY[reason]
  return (
    <Notice
      tone={reason === 'canceled' ? 'default' : 'destructive'}
      icon={reason === 'expired' ? TimerOffIcon : BanIcon}
      role="alert"
      title={title}
      actions={
        <Link href={showtimeHref} className={buttonVariants({ size: 'lg' })}>
          Choose seats again
        </Link>
      }
    >
      {text}
    </Notice>
  )
}
