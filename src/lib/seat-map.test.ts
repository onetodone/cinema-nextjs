import { describe, expect, it } from 'vitest'
import type { Seat } from '@/lib/api/types'
import {
  groupSeatsByRow,
  MAX_SEATS_PER_BOOKING,
  moveFocus,
  reconcileSelection,
  seatLabel,
  seatNames,
  selectionTotal,
  toggleSeat,
} from '@/lib/seat-map'

let nextId = 1
function seat(row: string, number: number, overrides: Partial<Seat> = {}): Seat {
  return { id: nextId++, row, number, type: 'standard', price_cents: 1100, status: 'available', ...overrides }
}

/** A hall with a short front row (4 seats) and two rows of 6, as the API orders them. */
function hall() {
  nextId = 1
  const seats = [
    ...[1, 2, 3, 4].map((number) => seat('A', number)),
    ...[1, 2, 3, 4, 5, 6].map((number) => seat('B', number)),
    ...[1, 2, 3, 4, 5, 6].map((number) => seat('C', number, { type: 'vip', price_cents: 1650 })),
  ]
  return { seats, rows: groupSeatsByRow(seats), byId: new Map(seats.map((item) => [item.id, item])) }
}

function idOf(seats: Seat[], row: string, number: number): number {
  return seats.find((item) => item.row === row && item.number === number)!.id
}

describe('groupSeatsByRow', () => {
  it('keeps the API order of rows and seats (AA after Z)', () => {
    nextId = 1
    const rows = groupSeatsByRow([seat('Z', 1), seat('Z', 2), seat('AA', 1)])

    expect(rows.map((row) => [row.row, row.seats.map((item) => item.number)])).toEqual([
      ['Z', [1, 2]],
      ['AA', [1]],
    ])
  })
})

describe('labels', () => {
  it('names seats and lists them', () => {
    expect(seatNames([{ row: 'C', number: 7 }])).toBe('C7')
    expect(
      seatNames([
        { row: 'C', number: 7 },
        { row: 'C', number: 8 },
      ]),
    ).toBe('C7 and C8')
    expect(
      seatNames([
        { row: 'C', number: 7 },
        { row: 'C', number: 8 },
        { row: 'D', number: 1 },
      ]),
    ).toBe('C7, C8, and D1')
  })

  it('describes a seat for screen readers', () => {
    nextId = 1
    expect(seatLabel(seat('C', 7, { type: 'vip', price_cents: 1500 }), 'USD', 'available')).toBe(
      'Row C, seat 7, VIP, $15.00, available',
    )
    expect(seatLabel(seat('A', 1), 'USD', 'held')).toBe('Row A, seat 1, $11.00, on hold')
    expect(seatLabel(seat('A', 2, { type: 'accessible' }), 'USD', 'selected')).toBe(
      'Row A, seat 2, Wheelchair accessible, $11.00, selected',
    )
  })
})

describe('toggleSeat', () => {
  it('adds a free seat and removes a picked one', () => {
    const { seats } = hall()

    const added = toggleSeat([], seats[0])
    expect(added).toEqual({ ids: [seats[0].id] })
    expect(toggleSeat(added.ids, seats[0])).toEqual({ ids: [] })
  })

  it('refuses seats that are held or sold', () => {
    nextId = 1
    expect(toggleSeat([], seat('A', 1, { status: 'held' }))).toEqual({ ids: [], rejected: 'unavailable' })
    expect(toggleSeat([], seat('A', 2, { status: 'sold' }))).toEqual({ ids: [], rejected: 'unavailable' })
  })

  it('stops at the booking limit but still lets a seat go', () => {
    const { seats } = hall()
    const full = seats.slice(0, MAX_SEATS_PER_BOOKING).map((item) => item.id)

    expect(toggleSeat(full, seats[MAX_SEATS_PER_BOOKING])).toEqual({ ids: full, rejected: 'limit' })
    expect(toggleSeat(full, seats[0]).ids).toHaveLength(MAX_SEATS_PER_BOOKING - 1)
  })
})

describe('reconcileSelection', () => {
  it('drops seats that someone took and reports them', () => {
    const { seats } = hall()
    const picked = [seats[0].id, seats[1].id, seats[2].id]
    const fresh = new Map(
      seats.map((item) => [item.id, item.id === seats[1].id ? { ...item, status: 'held' as const } : item]),
    )

    const result = reconcileSelection(picked, fresh)

    expect(result.ids).toEqual([seats[0].id, seats[2].id])
    expect(result.lost.map((item) => item.id)).toEqual([seats[1].id])
  })

  it('drops unknown seats silently', () => {
    const { byId } = hall()
    expect(reconcileSelection([999], byId)).toEqual({ ids: [], lost: [] })
  })
})

describe('selectionTotal', () => {
  it('sums the prices of the picked seats in cents', () => {
    const { seats, byId } = hall()
    expect(selectionTotal([idOf(seats, 'A', 1), idOf(seats, 'C', 1)], byId)).toBe(1100 + 1650)
    expect(selectionTotal([], byId)).toBe(0)
  })
})

describe('moveFocus', () => {
  it('moves along a row and stops at its ends', () => {
    const { seats, rows } = hall()

    expect(moveFocus(rows, idOf(seats, 'B', 3), 'ArrowRight')).toBe(idOf(seats, 'B', 4))
    expect(moveFocus(rows, idOf(seats, 'B', 3), 'ArrowLeft')).toBe(idOf(seats, 'B', 2))
    expect(moveFocus(rows, idOf(seats, 'B', 1), 'ArrowLeft')).toBe(idOf(seats, 'B', 1))
    expect(moveFocus(rows, idOf(seats, 'B', 6), 'ArrowRight')).toBe(idOf(seats, 'B', 6))
    expect(moveFocus(rows, idOf(seats, 'B', 3), 'Home')).toBe(idOf(seats, 'B', 1))
    expect(moveFocus(rows, idOf(seats, 'B', 3), 'End')).toBe(idOf(seats, 'B', 6))
  })

  it('moves to the seat right above or below in the centred layout', () => {
    const { seats, rows } = hall()

    // B2 sits under A1 (row A is two seats shorter, centred).
    expect(moveFocus(rows, idOf(seats, 'B', 2), 'ArrowUp')).toBe(idOf(seats, 'A', 1))
    expect(moveFocus(rows, idOf(seats, 'A', 1), 'ArrowDown')).toBe(idOf(seats, 'B', 2))
    // Beyond the short row's ends, the nearest seat.
    expect(moveFocus(rows, idOf(seats, 'B', 1), 'ArrowUp')).toBe(idOf(seats, 'A', 1))
    expect(moveFocus(rows, idOf(seats, 'B', 6), 'ArrowUp')).toBe(idOf(seats, 'A', 4))
    expect(moveFocus(rows, idOf(seats, 'B', 4), 'ArrowDown')).toBe(idOf(seats, 'C', 4))
  })

  it('stays put at the first and last rows, and jumps with PageUp/PageDown', () => {
    const { seats, rows } = hall()

    expect(moveFocus(rows, idOf(seats, 'A', 2), 'ArrowUp')).toBe(idOf(seats, 'A', 2))
    expect(moveFocus(rows, idOf(seats, 'C', 2), 'ArrowDown')).toBe(idOf(seats, 'C', 2))
    expect(moveFocus(rows, idOf(seats, 'C', 3), 'PageUp')).toBe(idOf(seats, 'A', 2))
    expect(moveFocus(rows, idOf(seats, 'A', 2), 'PageDown')).toBe(idOf(seats, 'C', 3))
  })

  it('ignores a seat that is not on the map', () => {
    const { rows } = hall()
    expect(moveFocus(rows, 999, 'ArrowLeft')).toBe(999)
  })
})
