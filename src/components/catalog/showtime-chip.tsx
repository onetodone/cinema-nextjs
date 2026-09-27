'use client'

import Link from 'next/link'
import type { Showtime } from '@/lib/api/types'
import { availabilityOf } from '@/lib/catalog'
import { formatMoney } from '@/lib/money'
import { formatShowtime } from '@/lib/time'
import { useHasStarted } from '@/hooks/use-now'
import { cn } from '@/lib/utils'

type ShowtimeChipData = Pick<
  Showtime,
  'id' | 'starts_at' | 'hall' | 'base_price_cents' | 'currency' | 'seats_available' | 'seats_total'
>

/**
 * A showtime as a link to its seat map: start time, hall, standard price, and availability. Showtimes that have
 * started (by the viewer's clock, after hydration) or are sold out stay reachable but are dimmed.
 */
export function ShowtimeChip({ showtime }: { showtime: ShowtimeChipData }) {
  const started = useHasStarted(showtime.starts_at)
  const availability = availabilityOf(showtime)
  const time = formatShowtime(showtime.starts_at)
  const price = formatMoney(showtime.base_price_cents, showtime.currency)
  const status = started ? 'Started' : availability.label
  const muted = started || availability.tone === 'sold-out'

  return (
    <Link
      href={`/showtimes/${showtime.id}`}
      aria-label={`${time}, ${showtime.hall.name}, from ${price}, ${status}`}
      data-started={started || undefined}
      className={cn(
        'flex min-w-24 flex-col gap-0.5 rounded-lg border px-3 py-2 transition-colors outline-none hover:border-primary/60 hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        // Muted without lowering opacity, so the text keeps its contrast.
        muted ? 'border-dashed text-muted-foreground' : 'bg-card text-card-foreground',
      )}
    >
      <span className="text-base leading-tight font-semibold tabular-nums">{time}</span>
      <span className="text-xs text-muted-foreground">
        {showtime.hall.name} · {price}
      </span>
      <span
        className={cn(
          'text-xs',
          muted || availability.tone === 'open' ? 'text-muted-foreground' : 'font-medium text-primary',
        )}
      >
        {status}
      </span>
    </Link>
  )
}
