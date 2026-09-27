'use client'

import { lazy, Suspense, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  BanIcon,
  CircleDotIcon,
  ClockIcon,
  SearchXIcon,
  TicketIcon,
  TicketXIcon,
} from 'lucide-react'
import type { Booking, Seat, SeatMap as SeatMapData } from '@/lib/api/types'
import { errorMessage } from '@/lib/api/messages'
import { useAuth } from '@/lib/auth/context'
import { loginHref } from '@/lib/auth/next-path'
import { activeBookingFor, holdOutcome, isActiveBooking } from '@/lib/bookings'
import { seatMapQuery } from '@/lib/queries/catalog'
import { queryKeys } from '@/lib/queries/keys'
import { saveSelection, takeSavedSelection } from '@/lib/saved-selection'
import { groupSeatsByRow, MAX_SEATS_PER_BOOKING, seatNames, toggleSeat } from '@/lib/seat-map'
import { serverSkewMs } from '@/lib/server-clock'
import { formatCountdown, remainingMs } from '@/lib/time'
import { useActiveBookings } from '@/hooks/use-active-bookings'
import { useCancelBooking } from '@/hooks/use-cancel-booking'
import { useCountdown } from '@/hooks/use-countdown'
import { useHoldSeats } from '@/hooks/use-hold-seats'
import { useHasStarted } from '@/hooks/use-now'
import { useSeatSelection } from '@/hooks/use-seat-selection'
import { Notice } from '@/components/layout/notice'
import { SeatLegend } from '@/components/seat-map/legend'
import { SeatMap } from '@/components/seat-map/seat-map'
import { SelectionSummary, type SummaryError } from '@/components/seat-map/selection-summary'
import { buttonVariants } from '@/components/ui/button'

// Only a viewer who already holds seats here ever sees this dialog: its code (Base UI's dialog) loads when needed.
const loadActiveBookingDialog = () => import('@/components/seat-map/active-booking-dialog')
const ActiveBookingDialog = lazy(() =>
  loadActiveBookingDialog().then((module) => ({ default: module.ActiveBookingDialog })),
)

/** How long seats that a hold found taken keep flashing. */
const JUST_TAKEN_MS = 4_000

const NO_IDS: ReadonlySet<number> = new Set()

interface SeatPickerProps {
  showtimeId: number
  startsAt: string
  canceled: boolean
  /** The showtime had started when the server rendered the page (the viewer's clock takes over after hydration). */
  startedWhenFetched?: boolean
  /** The server's snapshot of the map, and when it was taken (epoch ms). */
  initialSeatMap: SeatMapData
  fetchedAt: number
}

/**
 * The live seat map of a showtime with the local selection, and the way on to checkout. The map polls while the
 * showtime is bookable; seats that someone else takes leave the selection by themselves.
 *
 * "Continue" holds the picked seats and opens the checkout. A guest's pick is saved in this tab while they sign in,
 * and picked again when they come back. Seats the viewer already holds show as theirs, with the way to their
 * checkout.
 */
export function SeatPicker({
  showtimeId,
  startsAt,
  canceled,
  startedWhenFetched = false,
  initialSeatMap,
  fetchedAt,
}: SeatPickerProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { status } = useAuth()
  // The server's answer renders with the page, so a showtime that has started shows closed from the first paint.
  const started = useHasStarted(startsAt) || startedWhenFetched
  /** What a hold answer revealed: sales are over, or the showtime is gone. */
  const [closed, setClosed] = useState<'not-bookable' | 'not-found' | null>(null)
  const bookable = !canceled && !started && closed === null

  const { data: seatMap, isRefetchError } = useQuery({
    ...seatMapQuery(showtimeId, { live: bookable }),
    initialData: initialSeatMap,
    initialDataUpdatedAt: fetchedAt,
  })

  const seatsById = useMemo(() => new Map(seatMap.seats.map((seat) => [seat.id, seat])), [seatMap.seats])
  const rows = useMemo(() => groupSeatsByRow(seatMap.seats), [seatMap.seats])
  const selection = useSeatSelection(seatsById)
  const selectedIds = useMemo(() => new Set(selection.ids), [selection.ids])
  const selectedSeats = useMemo(
    () => seatMap.seats.filter((seat) => selectedIds.has(seat.id)),
    [seatMap.seats, selectedIds],
  )

  const myHold = activeBookingFor(useActiveBookings(), showtimeId)
  const mineIds = useMemo(() => (myHold ? new Set(myHold.seats.map((seat) => seat.id)) : NO_IDS), [myHold])

  const hold = useHoldSeats(showtimeId)
  const cancel = useCancelBooking()
  const [holdError, setHoldError] = useState<SummaryError | null>(null)
  const [justTaken, setJustTaken] = useState<ReadonlySet<number>>(NO_IDS)
  const [dialogBookingId, setDialogBookingId] = useState<string | null>(null)
  // Mounted from its first opening on, so that it can animate out when it closes.
  const [dialogMounted, setDialogMounted] = useState(false)
  if (dialogBookingId !== null && !dialogMounted) setDialogMounted(true)

  // A pick saved before signing in comes back (once), without the seats taken meanwhile.
  const restoreSavedSelection = useEffectEvent(() => {
    const saved = takeSavedSelection(showtimeId)
    if (!saved || saved.length === 0) return
    const gone = selection.restore(saved)
    if (gone.length > 0) {
      toast.warning(
        gone.length === 1
          ? `Seat ${seatNames(gone)} was taken while you were away`
          : `Seats ${seatNames(gone)} were taken while you were away`,
        { id: 'seats-taken', description: 'The rest of your pick is still here.' },
      )
    }
  })
  useEffect(() => restoreSavedSelection(), [showtimeId])

  // A viewer with a hold here is the one who may need the dialog: fetch its code ahead of time.
  useEffect(() => {
    if (myHold) void loadActiveBookingDialog()
  }, [myHold])

  useEffect(() => {
    if (justTaken.size === 0) return
    const timer = setTimeout(() => setJustTaken(NO_IDS), JUST_TAKEN_MS)
    return () => clearTimeout(timer)
  }, [justTaken])

  // Next keeps this page's state while the viewer is elsewhere: messages about the last attempt are stale by then.
  useLayoutEffect(
    () => () => {
      setHoldError(null)
      setJustTaken(NO_IDS)
      setDialogBookingId(null)
    },
    [],
  )

  function handleSeatClick(seatId: number) {
    const seat = seatsById.get(seatId)
    if (!seat || !bookable || hold.isPending) return
    const result = toggleSeat(selection.ids, seat)
    if (result.rejected === 'limit') {
      toast.warning(`You can pick up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, { id: 'seat-limit' })
    } else if (!result.rejected) {
      selection.setIds(result.ids)
      setHoldError(null)
    }
  }

  function signInFirst(seatIds: readonly number[]) {
    // Holding seats needs an account: the pick waits in this tab, and sign-in comes back here.
    saveSelection(showtimeId, seatIds)
    router.push(loginHref(`/showtimes/${showtimeId}`))
  }

  function goToCheckout(bookingId: string) {
    setDialogBookingId(null)
    router.push(`/checkout/${bookingId}`)
  }

  function handleContinue() {
    if (status === 'unauthenticated') {
      signInFirst(selection.ids)
      return
    }
    // One unpaid booking per showtime: ask first rather than send a hold that the API would refuse.
    if (myHold && (myHold.status === 'processing' || holdTimeLeft(myHold) > 0)) {
      setDialogBookingId(myHold.id)
      return
    }
    void submitHold(selection.ids)
  }

  async function submitHold(seatIds: readonly number[], { retryWhenFreed = true } = {}) {
    setHoldError(null)
    let booking: Booking
    try {
      booking = await hold.mutateAsync(seatIds)
    } catch (error) {
      const outcome = holdOutcome(error)
      switch (outcome.kind) {
        case 'seats-taken':
          handleSeatsTaken(outcome.seatIds)
          return
        case 'active-booking':
          void queryClient.invalidateQueries({ queryKey: queryKeys.private.activeBookings() })
          if (outcome.bookingId) setDialogBookingId(outcome.bookingId)
          // The other booking ended as the API answered: the seats can be held now.
          else if (retryWhenFreed) void submitHold(seatIds, { retryWhenFreed: false })
          return
        case 'closed':
          setClosed('not-bookable')
          return
        case 'not-found':
          setClosed('not-found')
          return
        case 'unknown-seat':
          toast.error(errorMessage(error), { id: 'hold-failed' })
          void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.seatMap(showtimeId) })
          return
        case 'signed-out':
          signInFirst(seatIds)
          return
        case 'busy':
          setHoldError({ message: errorMessage(error) })
          return
        case 'failed':
          setHoldError({ message: outcome.message, reference: outcome.reference })
          return
      }
    }
    // Next keeps this page while the checkout shows: without its pick, coming back shows the seats as the viewer's.
    selection.clear()
    setDialogBookingId(null)
    router.push(`/checkout/${booking.id}`)
  }

  function handleSeatsTaken(seatIds: readonly number[]) {
    const byOthers = seatIds.filter((id) => !mineIds.has(id))
    selection.remove(seatIds)
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.seatMap(showtimeId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.private.activeBookings() })
    const taken = byOthers.map((id) => seatsById.get(id)).filter((seat): seat is Seat => seat !== undefined)
    if (taken.length === 0) {
      toast.info('You already hold some of these seats.', { id: 'seats-taken' })
      return
    }
    setJustTaken(new Set(byOthers))
    toast.warning(
      taken.length === 1 ? `Seat ${seatNames(taken)} was just taken` : `Seats ${seatNames(taken)} were just taken`,
      { id: 'seats-taken', description: 'Someone else got there first. Pick other seats.' },
    )
  }

  async function handleReplace(bookingId: string, active: boolean) {
    const seatIds = selection.ids
    if (active) {
      try {
        await cancel.mutateAsync({ bookingId, showtimeId })
      } catch (error) {
        setDialogBookingId(null)
        toast.error(`Couldn’t release your seats. ${errorMessage(error)}`, { id: 'hold-failed' })
        return
      }
    }
    await submitHold(seatIds)
  }

  const replacing = cancel.isPending || (dialogBookingId !== null && hold.isPending)
  // Nothing left to pick — unless the viewer holds seats here themselves (their notice says so).
  const soldOut = bookable && !myHold && seatMap.summary.available === 0

  return (
    <div className="flex flex-col gap-5">
      {canceled ? (
        <Notice tone="destructive" icon={BanIcon} title="This showtime was canceled.">
          Its seats can&apos;t be booked. Pick another showtime of this movie.
        </Notice>
      ) : started ? (
        <Notice icon={ClockIcon} title="This showtime has started.">
          Sales are closed. Pick a later showtime.
        </Notice>
      ) : closed === 'not-bookable' ? (
        <Notice tone="destructive" icon={BanIcon} title="Sales for this showtime are closed.">
          It has started or was canceled. Pick another showtime.
        </Notice>
      ) : closed === 'not-found' ? (
        <Notice tone="destructive" icon={SearchXIcon} title="This showtime no longer exists.">
          Pick another showtime from the schedule.
        </Notice>
      ) : soldOut ? (
        <Notice icon={TicketXIcon} title="This showtime is sold out.">
          Seats on hold go back on sale if they aren&apos;t paid for in time, and this map shows them as they do. Or
          pick another showtime.
        </Notice>
      ) : null}

      <div className="flex flex-col gap-4">
        <LiveStatus
          live={bookable}
          failing={isRefetchError}
          available={seatMap.summary.available}
          total={seatMap.summary.total}
        />
        <SeatLegend seats={seatMap.seats} currency={seatMap.currency} showMine={mineIds.size > 0} />
      </div>

      <SeatMap
        rows={rows}
        selectedIds={selectedIds}
        mineIds={mineIds}
        justTakenIds={justTaken}
        currency={seatMap.currency}
        bookable={bookable}
        onSeatClick={handleSeatClick}
      />

      {/* Under the map, not above it: it arrives after the session check, and there it pushes nothing out of place. */}
      {myHold ? <HoldNotice booking={myHold} /> : null}

      <SelectionSummary
        seats={selectedSeats}
        currency={seatMap.currency}
        bookable={bookable}
        pending={hold.isPending || cancel.isPending}
        error={holdError}
        onClear={() => {
          selection.clear()
          setHoldError(null)
        }}
        onContinue={handleContinue}
      />

      {dialogMounted ? (
        <Suspense fallback={null}>
          <ActiveBookingDialog
            bookingId={dialogBookingId}
            selectedSeats={selectedSeats}
            replacing={replacing}
            onContinue={goToCheckout}
            onReplace={(bookingId, active) => void handleReplace(bookingId, active)}
            onClose={() => setDialogBookingId(null)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

/** Time left on a hold by the server's clock, for event handlers (render reads the shared clock instead). */
function holdTimeLeft(booking: Booking): number {
  return remainingMs(booking.expires_at, Date.now(), serverSkewMs())
}

/** The viewer's own hold on this showtime, with the time it has left and the way to its checkout. */
function HoldNotice({ booking }: { booking: Booking }) {
  const remaining = useCountdown(booking.status === 'pending' ? booking.expires_at : null, booking.created_at)
  // A hold whose time is up is on its way out (the API's worker releases it within seconds).
  if (!isActiveBooking(booking) || remaining === 0) return null

  const seats = seatNames(booking.seats)
  const processing = booking.status === 'processing'
  return (
    <Notice
      tone="highlight"
      icon={TicketIcon}
      role="none"
      title={processing ? `Your payment for ${seats} is being processed.` : `You're holding ${seats}.`}
      actions={
        <Link href={`/checkout/${booking.id}`} className={buttonVariants({ size: 'lg' })}>
          {processing ? 'View checkout' : 'Go to checkout'}
        </Link>
      }
    >
      {processing ? (
        'The seats stay yours while it completes.'
      ) : (
        <>
          They&apos;re yours for{' '}
          <span className="font-medium text-foreground tabular-nums">
            {remaining === null ? '…' : formatCountdown(remaining)}
          </span>{' '}
          more. Pay for them at checkout, or pick other seats to change your hold.
        </>
      )}
    </Notice>
  )
}

function LiveStatus({
  live,
  failing,
  available,
  total,
}: {
  live: boolean
  failing: boolean
  available: number
  total: number
}) {
  const counts = `${available} of ${total} seats free`
  if (!live) return <p className="text-sm text-muted-foreground">{counts}</p>
  if (failing) {
    return (
      <p className="flex items-center gap-2 text-sm text-destructive">
        <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
        Can&apos;t reach the cinema — the map may be out of date. Retrying…
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <CircleDotIcon className="size-4 shrink-0 text-primary motion-safe:animate-pulse" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">Live</span> · {counts}
      </span>
    </p>
  )
}
