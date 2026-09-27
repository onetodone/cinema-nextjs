'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import type { Seat } from '@/lib/api/types'
import { isSeatNavigationKey, moveFocus, type SeatRow, type SeatState } from '@/lib/seat-map'
import { SeatButton } from '@/components/seat-map/seat'

interface SeatMapProps {
  rows: readonly SeatRow[]
  selectedIds: ReadonlySet<number>
  currency: string
  /** Whether seats can be picked at all (the showtime is scheduled and has not started). */
  bookable: boolean
  onSeatClick: (seatId: number) => void
}

function stateOf(seat: Seat, selectedIds: ReadonlySet<number>): SeatState {
  if (selectedIds.has(seat.id)) return 'selected'
  return seat.status
}

/** The seat to start keyboard navigation from: a picked seat, else the first free one, else the first. */
function initialFocus(rows: readonly SeatRow[], selectedIds: ReadonlySet<number>): number | null {
  const seats = rows.flatMap((row) => row.seats)
  return (
    seats.find((seat) => selectedIds.has(seat.id))?.id ??
    seats.find((seat) => seat.status === 'available')?.id ??
    seats[0]?.id ??
    null
  )
}

function seatIdOf(target: EventTarget): number | null {
  const button = target instanceof Element ? target.closest<HTMLElement>('[data-seat-id]') : null
  return button ? Number(button.dataset.seatId) : null
}

/**
 * The hall: the screen on top, rows in API order centred under it, row letters on both sides. It scrolls
 * sideways inside its frame on narrow screens. One seat at a time is in the tab order (roving tabindex); the arrow
 * keys, Home/End, and PageUp/PageDown move between seats, Space and Enter pick one.
 */
export function SeatMap({ rows, selectedIds, currency, bookable, onSeatClick }: SeatMapProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<number | null>(null)

  // A hall wider than the screen opens scrolled to its middle, the seats most people want.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (frame) frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2
  }, [])
  const tabStop = focusId ?? initialFocus(rows, selectedIds)

  function handleClick(event: React.MouseEvent) {
    const seatId = seatIdOf(event.target)
    if (seatId === null) return
    setFocusId(seatId)
    onSeatClick(seatId)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!isSeatNavigationKey(event.key)) return
    const seatId = seatIdOf(event.target)
    if (seatId === null) return
    event.preventDefault()
    const next = moveFocus(rows, seatId, event.key)
    setFocusId(next)
    mapRef.current?.querySelector<HTMLElement>(`[data-seat-id="${next}"]`)?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={frameRef}
        className="-mx-4 overflow-x-auto border-y bg-card px-4 py-6 sm:mx-0 sm:rounded-xl sm:border sm:px-6"
      >
        <div className="mx-auto flex w-max flex-col gap-1.5">
          <div aria-hidden="true" className="mb-6 flex flex-col items-center gap-1.5">
            <div className="h-1.5 w-4/5 rounded-[50%] bg-linear-to-r from-transparent via-primary/70 to-transparent shadow-[0_6px_24px_0] shadow-primary/40" />
            <span className="text-[0.6875rem] font-medium tracking-[0.3em] text-muted-foreground uppercase">
              Screen
            </span>
          </div>
          <div
            ref={mapRef}
            role="group"
            aria-label="Seats"
            aria-describedby="seat-map-help"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="flex flex-col gap-1.5"
          >
            {rows.map(({ row, seats }) => (
              <div key={row} role="group" aria-label={`Row ${row}`} className="flex items-center gap-2">
                <RowLetter row={row} />
                <div className="flex flex-1 justify-center gap-1">
                  {seats.map((seat) => {
                    const state = stateOf(seat, selectedIds)
                    return (
                      <SeatButton
                        key={seat.id}
                        seat={seat}
                        state={state}
                        currency={currency}
                        tabbable={seat.id === tabStop}
                        interactive={bookable && (state === 'available' || state === 'selected')}
                      />
                    )
                  })}
                </div>
                <RowLetter row={row} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p id="seat-map-help" className="text-xs text-muted-foreground">
        Tip: use the arrow keys to move between seats, and Space or Enter to pick one.
      </p>
    </div>
  )
}

function RowLetter({ row }: { row: string }) {
  return (
    <span aria-hidden="true" className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
      {row}
    </span>
  )
}
