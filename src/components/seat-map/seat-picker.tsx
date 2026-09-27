'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangleIcon, BanIcon, CircleDotIcon, ClockIcon } from 'lucide-react'
import type { SeatMap as SeatMapData } from '@/lib/api/types'
import { seatMapQuery } from '@/lib/queries/catalog'
import { groupSeatsByRow, MAX_SEATS_PER_BOOKING, toggleSeat } from '@/lib/seat-map'
import { useHasStarted } from '@/hooks/use-now'
import { useSeatSelection } from '@/hooks/use-seat-selection'
import { SeatLegend } from '@/components/seat-map/legend'
import { SeatMap } from '@/components/seat-map/seat-map'
import { SelectionSummary } from '@/components/seat-map/selection-summary'
import { cn } from '@/lib/utils'

interface SeatPickerProps {
  showtimeId: number
  startsAt: string
  canceled: boolean
  /** The server's snapshot of the map, and when it was taken (epoch ms). */
  initialSeatMap: SeatMapData
  fetchedAt: number
}

/**
 * The live seat map of a showtime with the local selection. The map polls while the showtime is bookable; seats
 * that someone else takes leave the selection by themselves.
 */
export function SeatPicker({ showtimeId, startsAt, canceled, initialSeatMap, fetchedAt }: SeatPickerProps) {
  const router = useRouter()
  const started = useHasStarted(startsAt)
  const bookable = !canceled && !started

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

  function handleSeatClick(seatId: number) {
    const seat = seatsById.get(seatId)
    if (!seat || !bookable) return
    const result = toggleSeat(selection.ids, seat)
    if (result.rejected === 'limit') {
      toast.warning(`You can pick up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, { id: 'seat-limit' })
    } else if (!result.rejected) {
      selection.setIds(result.ids)
    }
  }

  function handleContinue() {
    // Holding seats needs an account; sign-in comes back to this showtime.
    router.push(`/login?next=${encodeURIComponent(`/showtimes/${showtimeId}`)}`)
  }

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
      ) : null}

      <div className="flex flex-col gap-4">
        <LiveStatus
          live={bookable}
          failing={isRefetchError}
          available={seatMap.summary.available}
          total={seatMap.summary.total}
        />
        <SeatLegend seats={seatMap.seats} currency={seatMap.currency} />
      </div>

      <SeatMap
        rows={rows}
        selectedIds={selectedIds}
        currency={seatMap.currency}
        bookable={bookable}
        onSeatClick={handleSeatClick}
      />

      <SelectionSummary
        seats={selectedSeats}
        currency={seatMap.currency}
        bookable={bookable}
        onClear={selection.clear}
        onContinue={handleContinue}
      />
    </div>
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

function Notice({
  tone = 'default',
  icon: Icon,
  title,
  children,
}: {
  tone?: 'default' | 'destructive'
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex gap-3 rounded-xl border p-4 text-sm',
        tone === 'destructive' ? 'border-destructive/40 bg-destructive/10' : 'bg-muted/50',
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'destructive' && 'text-destructive')} aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}
