import type { Seat, SeatType } from '@/lib/api/types'
import { formatMoney } from '@/lib/money'

/** The contract's `seat_ids` `maxItems`: one booking holds 1 to 10 seats. */
export const MAX_SEATS_PER_BOOKING = 10

/**
 * How a seat looks on the map. `available`, `held`, and `sold` come from the API; `selected` is the local
 * selection. (`mine` and `just-taken` join them with booking.)
 */
export type SeatState = 'available' | 'selected' | 'held' | 'sold'

export interface SeatRow {
  row: string
  seats: Seat[]
}

/** Rows in the API's order (by row, `AA` after `Z`), seats by number within a row. */
export function groupSeatsByRow(seats: readonly Seat[]): SeatRow[] {
  const rows: SeatRow[] = []
  for (const seat of seats) {
    const last = rows.at(-1)
    if (last?.row === seat.row) last.seats.push(seat)
    else rows.push({ row: seat.row, seats: [seat] })
  }
  return rows
}

/** "C7". */
export function seatName(seat: Pick<Seat, 'row' | 'number'>): string {
  return `${seat.row}${seat.number}`
}

/** "C7, C8, and D1". */
export function seatNames(seats: readonly Pick<Seat, 'row' | 'number'>[]): string {
  const names = seats.map(seatName)
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`
}

export const SEAT_TYPE_LABEL: Record<SeatType, string> = {
  standard: 'Standard',
  vip: 'VIP',
  accessible: 'Wheelchair accessible',
}

export const SEAT_STATE_LABEL: Record<SeatState, string> = {
  available: 'available',
  selected: 'selected',
  held: 'on hold',
  sold: 'sold',
}

/** The accessible name of a seat button: "Row C, seat 7, VIP, $15.00, available". */
export function seatLabel(seat: Seat, currency: string, state: SeatState): string {
  const parts = [`Row ${seat.row}`, `seat ${seat.number}`]
  if (seat.type !== 'standard') parts.push(SEAT_TYPE_LABEL[seat.type])
  parts.push(formatMoney(seat.price_cents, currency), SEAT_STATE_LABEL[state])
  return parts.join(', ')
}

export interface ToggleResult {
  ids: number[]
  /** Why the seat could not be added: the booking limit, or the seat is not available. */
  rejected?: 'limit' | 'unavailable'
}

/** Adds or removes a seat from the selection. Removing always works; adding needs a free seat and room. */
export function toggleSeat(ids: readonly number[], seat: Seat, max = MAX_SEATS_PER_BOOKING): ToggleResult {
  if (ids.includes(seat.id)) return { ids: ids.filter((id) => id !== seat.id) }
  if (seat.status !== 'available') return { ids: [...ids], rejected: 'unavailable' }
  if (ids.length >= max) return { ids: [...ids], rejected: 'limit' }
  return { ids: [...ids, seat.id] }
}

export interface ReconcileResult {
  ids: number[]
  /** Selected seats that someone else took since they were picked. */
  lost: Seat[]
}

/** Drops selected seats that a fresh seat map no longer shows as available. */
export function reconcileSelection(ids: readonly number[], seatsById: ReadonlyMap<number, Seat>): ReconcileResult {
  const kept: number[] = []
  const lost: Seat[] = []
  for (const id of ids) {
    const seat = seatsById.get(id)
    if (seat?.status === 'available') kept.push(id)
    else if (seat) lost.push(seat)
  }
  return { ids: kept, lost }
}

/** The sum of the selected seats' prices, in integer cents. */
export function selectionTotal(ids: readonly number[], seatsById: ReadonlyMap<number, Seat>): number {
  let total = 0
  for (const id of ids) total += seatsById.get(id)?.price_cents ?? 0
  return total
}

export type SeatNavigationKey =
  'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' | 'PageUp' | 'PageDown'

const NAVIGATION_KEYS = new Set<string>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

export function isSeatNavigationKey(key: string): key is SeatNavigationKey {
  return NAVIGATION_KEYS.has(key)
}

/** The seat in `row` closest to horizontal position `x` (rows are centred, so 0 is the middle of every row). */
function seatAt(row: SeatRow, x: number): Seat {
  const index = Math.round(x + (row.seats.length - 1) / 2)
  return row.seats[Math.min(row.seats.length - 1, Math.max(0, index))]
}

/**
 * Where the roving focus goes from seat `fromId`: left/right within the row, up/down to the seat right above or
 * below in the centred layout, Home/End to the ends of the row, PageUp/PageDown to the first and last rows.
 * Returns the id of the seat to focus, or `fromId` when the move leaves the map.
 */
export function moveFocus(rows: readonly SeatRow[], fromId: number, key: SeatNavigationKey): number {
  const rowIndex = rows.findIndex((row) => row.seats.some((seat) => seat.id === fromId))
  if (rowIndex === -1) return fromId
  const row = rows[rowIndex]
  const index = row.seats.findIndex((seat) => seat.id === fromId)
  const x = index - (row.seats.length - 1) / 2

  switch (key) {
    case 'ArrowLeft':
      return row.seats[Math.max(0, index - 1)].id
    case 'ArrowRight':
      return row.seats[Math.min(row.seats.length - 1, index + 1)].id
    case 'Home':
      return row.seats[0].id
    case 'End':
      return row.seats[row.seats.length - 1].id
    case 'ArrowUp':
      return rowIndex > 0 ? seatAt(rows[rowIndex - 1], x).id : fromId
    case 'ArrowDown':
      return rowIndex < rows.length - 1 ? seatAt(rows[rowIndex + 1], x).id : fromId
    case 'PageUp':
      return seatAt(rows[0], x).id
    case 'PageDown':
      return seatAt(rows[rows.length - 1], x).id
  }
}
