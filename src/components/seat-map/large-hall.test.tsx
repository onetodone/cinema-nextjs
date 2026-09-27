import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Seat, SeatMap } from '@/lib/api/types'
import { queryKeys } from '@/lib/queries/keys'
import { renderWithQueryClient } from '@/test/query'
import { SeatPicker } from '@/components/seat-map/seat-picker'

// The API allows halls of up to 1 000 seats, and the map is polled every 5 seconds. A seat button renders its label
// once per render, so counting the labels counts seat renders: a poll or a pick must re-render the seats that
// changed, not the hall.

const labels = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/lib/seat-map', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seat-map')>()
  return {
    ...actual,
    seatLabel: (...args: Parameters<typeof actual.seatLabel>) => {
      labels.count++
      return actual.seatLabel(...args)
    },
  }
})

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() } }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))
vi.mock('@/lib/sync', () => ({ postSyncMessage: vi.fn(), subscribeSyncMessages: () => () => {} }))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
beforeEach(() => {
  labels.count = 0
})

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY' // 25 rows of 40 seats
const SEATS_PER_ROW = 40

/** A fresh 1 000-seat map (new objects every time, like a response body), with some seats changed. */
function hall(changes: Record<number, Partial<Seat>> = {}): SeatMap {
  const seats: Seat[] = []
  for (const [rowIndex, row] of [...ROWS].entries()) {
    for (let number = 1; number <= SEATS_PER_ROW; number++) {
      const id = rowIndex * SEATS_PER_ROW + number
      const type = rowIndex >= 22 ? 'vip' : rowIndex === 0 ? 'accessible' : 'standard'
      const seat: Seat = { id, row, number, type, price_cents: type === 'vip' ? 1650 : 1100, status: 'available' }
      seats.push({ ...seat, ...changes[id] })
    }
  }
  const count = (status: Seat['status']) => seats.filter((seat) => seat.status === status).length
  return {
    showtime_id: 7,
    movie: { id: 1, title: 'Orbit of Glass', duration_min: 142 },
    hall: { id: 1, name: 'Hall 9' },
    starts_at: '2999-01-01T19:30:00+02:00',
    currency: 'USD',
    summary: { available: count('available'), held: count('held'), sold: count('sold'), total: seats.length },
    seats,
  }
}

function renderHall() {
  const result = renderWithQueryClient(
    <SeatPicker
      showtimeId={7}
      startsAt="2999-01-01T19:30:00+02:00"
      canceled={false}
      initialSeatMap={hall()}
      fetchedAt={Date.now()}
    />,
  )
  expect(screen.getAllByRole('button', { name: /^Row / })).toHaveLength(1_000)
  labels.count = 0
  return result
}

/** One poll of the map, answered with `body`. */
async function poll(queryClient: ReturnType<typeof renderHall>['queryClient'], body: SeatMap) {
  server.use(http.get('*/v1/showtimes/7/seats', () => HttpResponse.json(body)))
  await act(() => queryClient.refetchQueries({ queryKey: queryKeys.catalog.seatMap(7) }))
}

describe('SeatPicker in a 1 000-seat hall', () => {
  it('re-renders only the seat that a poll changed', async () => {
    const { queryClient } = renderHall()

    await poll(queryClient, hall({ 500: { status: 'held' } }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Row M, seat 20,/ })).toHaveAccessibleName(
        'Row M, seat 20, $11.00, on hold',
      ),
    )
    expect(labels.count).toBe(1)
  })

  it('re-renders no seat when a poll brings no change', async () => {
    const { queryClient } = renderHall()

    await poll(queryClient, hall())

    expect(labels.count).toBe(0)
  })

  it('re-renders only the seats a pick changes: the seat, and the one that had the tab stop', async () => {
    const user = userEvent.setup()
    renderHall()

    await user.click(screen.getByRole('button', { name: /^Row M, seat 20,/ }))

    expect(screen.getByRole('button', { name: /^Row M, seat 20,/ })).toHaveAttribute('aria-pressed', 'true')
    expect(labels.count).toBe(2)
  })
})
