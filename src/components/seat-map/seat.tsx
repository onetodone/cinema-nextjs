import { memo } from 'react'
import { AccessibilityIcon, CheckIcon, Clock3Icon, XIcon } from 'lucide-react'
import type { Seat as SeatData, SeatType } from '@/lib/api/types'
import { seatLabel, type SeatState } from '@/lib/seat-map'
import { cn } from '@/lib/utils'

// A seat is never told apart by colour alone: states carry an icon (check, clock, cross) or the seat number, VIP
// seats have a thick "headrest" top edge, and accessible seats show the wheelchair symbol.

const STATE_CLASS: Record<SeatState, string> = {
  available: '',
  selected: 'border-primary bg-primary text-primary-foreground',
  held: 'border-dashed border-foreground/30 bg-transparent text-muted-foreground',
  sold: 'border-transparent bg-foreground/12 text-muted-foreground/80',
}

const AVAILABLE_TYPE_CLASS: Record<SeatType, string> = {
  standard: 'border-foreground/25 bg-secondary text-secondary-foreground',
  vip: 'border-seat-vip bg-seat-vip/15 text-foreground',
  accessible: 'border-seat-accessible bg-seat-accessible/15 text-seat-accessible',
}

export function seatClassName(state: SeatState, type: SeatType): string {
  return cn(
    'flex shrink-0 items-center justify-center rounded-t-[0.55rem] rounded-b-[0.2rem] border text-[0.625rem] leading-none font-medium tabular-nums select-none',
    type === 'vip' && 'border-t-4',
    state === 'available' ? AVAILABLE_TYPE_CLASS[type] : STATE_CLASS[state],
  )
}

/** What a seat shows inside: its number, or the symbol of its state or type. */
export function SeatGlyph({ state, type, number }: { state: SeatState; type: SeatType; number?: number }) {
  if (state === 'selected') return <CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" />
  if (state === 'held') return <Clock3Icon className="size-3" aria-hidden="true" />
  if (state === 'sold') return <XIcon className="size-3" strokeWidth={2.5} aria-hidden="true" />
  if (type === 'accessible') return <AccessibilityIcon className="size-3.5" aria-hidden="true" />
  return number === undefined ? null : <>{number}</>
}

interface SeatButtonProps {
  seat: SeatData
  state: SeatState
  currency: string
  /** The one seat in the roving tab order. */
  tabbable: boolean
  /** Whether the seat can be picked or dropped right now. */
  interactive: boolean
}

/**
 * A seat as a toggle button. Clicks and arrow keys are handled once on the map (event delegation), so a seat
 * re-renders only when its own data, state, or tab stop changes.
 */
export const SeatButton = memo(function SeatButton({ seat, state, currency, tabbable, interactive }: SeatButtonProps) {
  const label = seatLabel(seat, currency, state)
  return (
    <button
      type="button"
      data-seat-id={seat.id}
      tabIndex={tabbable ? 0 : -1}
      aria-pressed={state === 'selected'}
      aria-disabled={interactive ? undefined : true}
      aria-label={label}
      title={label}
      className={cn(
        seatClassName(state, seat.type),
        'size-7 transition-colors outline-none focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring sm:size-8 sm:text-[0.6875rem]',
        interactive
          ? state === 'available' && 'cursor-pointer hover:border-primary hover:bg-primary/25'
          : 'cursor-not-allowed',
      )}
    >
      <SeatGlyph state={state} type={seat.type} number={seat.number} />
    </button>
  )
})
