import type { Seat, SeatType } from '@/lib/api/types'
import { formatMoney } from '@/lib/money'
import { SEAT_TYPE_LABEL, type SeatState } from '@/lib/seat-map'
import { SeatGlyph, seatClassName } from '@/components/seat-map/seat'
import { cn } from '@/lib/utils'

const STATES: { state: SeatState; label: string }[] = [
  { state: 'available', label: 'Available' },
  { state: 'selected', label: 'Your pick' },
  { state: 'mine', label: 'Held by you' },
  { state: 'held', label: 'On hold' },
  { state: 'sold', label: 'Sold' },
]

const TYPE_ORDER: SeatType[] = ['standard', 'vip', 'accessible']

/** The lowest price of each seat type present on the map, in the order standard, VIP, accessible. */
export function pricesByType(seats: readonly Seat[]): { type: SeatType; cents: number }[] {
  const lowest = new Map<SeatType, number>()
  for (const seat of seats) {
    const current = lowest.get(seat.type)
    if (current === undefined || seat.price_cents < current) lowest.set(seat.type, seat.price_cents)
  }
  return TYPE_ORDER.filter((type) => lowest.has(type)).map((type) => ({ type, cents: lowest.get(type)! }))
}

function Swatch({ state, type, glyph = true }: { state: SeatState; type: SeatType; glyph?: boolean }) {
  return (
    <span aria-hidden="true" className={cn(seatClassName(state, type), 'size-5')}>
      {glyph ? <SeatGlyph state={state} type={type} /> : null}
    </span>
  )
}

/** The seat states and types on the map; "Held by you" appears only while the viewer holds seats here. */
export function SeatLegend({
  seats,
  currency,
  showMine = false,
}: {
  seats: readonly Seat[]
  currency: string
  showMine?: boolean
}) {
  const types = pricesByType(seats)
  const states = showMine ? STATES : STATES.filter(({ state }) => state !== 'mine')
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <ul aria-label="Seat states" className="flex flex-wrap gap-x-4 gap-y-2">
        {states.map(({ state, label }) => (
          <li key={state} className="flex items-center gap-2">
            <Swatch state={state} type="standard" />
            {label}
          </li>
        ))}
      </ul>
      <ul aria-label="Seat types and prices" className="flex flex-wrap gap-x-4 gap-y-2">
        {types.map(({ type, cents }) => (
          <li key={type} className="flex items-center gap-2">
            <Swatch state="available" type={type} glyph={type === 'accessible'} />
            <span>
              {SEAT_TYPE_LABEL[type]} <span className="text-muted-foreground">{formatMoney(cents, currency)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
