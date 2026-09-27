import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Seat, SeatMap } from '@/lib/api/types'
import { queryKeys } from '@/lib/queries/keys'
import { MAX_SEATS_PER_BOOKING } from '@/lib/seat-map'
import { renderWithQueryClient } from '@/test/query'
import { SeatPicker } from '@/components/seat-map/seat-picker'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const toast = vi.hoisted(() => ({ warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
beforeEach(() => {
  push.mockReset()
  toast.warning.mockReset()
})

const FUTURE = '2999-01-01T19:30:00+02:00'
const PAST = '2000-01-01T19:30:00+02:00'

function seatMap(overrides: (seat: Seat) => Partial<Seat> = () => ({})): SeatMap {
  const seats: Seat[] = []
  let id = 1
  for (const row of ['A', 'B']) {
    for (let number = 1; number <= 6; number++) {
      const seat: Seat = {
        id: id++,
        row,
        number,
        type: row === 'B' ? 'vip' : 'standard',
        price_cents: row === 'B' ? 1650 : 1100,
        status: 'available',
      }
      seats.push({ ...seat, ...overrides(seat) })
    }
  }
  const count = (status: Seat['status']) => seats.filter((seat) => seat.status === status).length
  return {
    showtime_id: 7,
    movie: { id: 1, title: 'Orbit of Glass', duration_min: 142 },
    hall: { id: 1, name: 'Hall 1' },
    starts_at: FUTURE,
    currency: 'USD',
    summary: { available: count('available'), held: count('held'), sold: count('sold'), total: seats.length },
    seats,
  }
}

function renderPicker(props: { initial?: SeatMap; startsAt?: string; canceled?: boolean } = {}) {
  return renderWithQueryClient(
    <SeatPicker
      showtimeId={7}
      startsAt={props.startsAt ?? FUTURE}
      canceled={props.canceled ?? false}
      initialSeatMap={props.initial ?? seatMap()}
      fetchedAt={Date.now()}
    />,
  )
}

const seatButton = (row: string, number: number) =>
  screen.getByRole('button', { name: new RegExp(`^Row ${row}, seat ${number},`) })

describe('SeatPicker', () => {
  it('shows every seat with its row, number, type, price, and state', () => {
    renderPicker({
      initial: seatMap((seat) => (seat.id === 2 ? { status: 'held' } : seat.id === 3 ? { status: 'sold' } : {})),
    })

    expect(seatButton('A', 1)).toHaveAccessibleName('Row A, seat 1, $11.00, available')
    expect(seatButton('A', 2)).toHaveAccessibleName('Row A, seat 2, $11.00, on hold')
    expect(seatButton('A', 2)).toHaveAttribute('aria-disabled', 'true')
    expect(seatButton('A', 3)).toHaveAccessibleName('Row A, seat 3, $11.00, sold')
    expect(seatButton('B', 1)).toHaveAccessibleName('Row B, seat 1, VIP, $16.50, available')
    expect(screen.getByText(/10 of 12 seats free/)).toBeInTheDocument()
  })

  it('picks and drops seats, and sums their prices', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.click(seatButton('A', 1))
    await user.click(seatButton('B', 2))

    expect(seatButton('A', 1)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 seats · $27.50')).toBeInTheDocument()
    expect(screen.getByText('A1 and B2')).toBeInTheDocument()

    await user.click(seatButton('A', 1))
    expect(seatButton('A', 1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 seat · $16.50')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('No seats picked')).toBeInTheDocument()
  })

  it('ignores held and sold seats', async () => {
    const user = userEvent.setup()
    renderPicker({ initial: seatMap((seat) => (seat.id === 1 ? { status: 'sold' } : {})) })

    await user.click(seatButton('A', 1))

    expect(seatButton('A', 1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('No seats picked')).toBeInTheDocument()
  })

  it(`stops at ${MAX_SEATS_PER_BOOKING} seats and says so`, async () => {
    const user = userEvent.setup()
    renderPicker()

    for (const number of [1, 2, 3, 4, 5, 6]) await user.click(seatButton('A', number))
    for (const number of [1, 2, 3, 4, 5]) await user.click(seatButton('B', number))

    expect(seatButton('B', 5)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(`${MAX_SEATS_PER_BOOKING} seats · $132.00`)).toBeInTheDocument()
    expect(toast.warning).toHaveBeenCalledWith(`You can pick up to ${MAX_SEATS_PER_BOOKING} seats per booking.`, {
      id: 'seat-limit',
    })
  })

  it('moves a single tab stop with the arrow keys and picks with Space', async () => {
    const user = userEvent.setup()
    renderPicker()

    await user.tab()
    expect(seatButton('A', 1)).toHaveFocus()
    expect(seatButton('A', 2)).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(seatButton('B', 2)).toHaveFocus()
    expect(seatButton('B', 2)).toHaveAttribute('tabindex', '0')
    expect(seatButton('A', 1)).toHaveAttribute('tabindex', '-1')

    await user.keyboard('{End} ')
    expect(seatButton('B', 6)).toHaveFocus()
    expect(seatButton('B', 6)).toHaveAttribute('aria-pressed', 'true')
  })

  it('drops a picked seat that someone else takes, and tells the viewer', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderPicker()

    await user.click(seatButton('A', 4))
    await user.click(seatButton('A', 5))
    // TanStack Query notifies observers on a timer, hence waitFor.
    act(() => {
      queryClient.setQueryData(
        queryKeys.catalog.seatMap(7),
        seatMap((seat) => (seat.id === 4 ? { status: 'held' } : {})),
      )
    })

    await waitFor(() => expect(seatButton('A', 4)).toHaveAccessibleName('Row A, seat 4, $11.00, on hold'))
    expect(screen.getByText('1 seat · $11.00')).toBeInTheDocument()
    expect(toast.warning).toHaveBeenCalledWith('Seat A4 was just taken', expect.objectContaining({ id: 'seats-taken' }))
  })

  it('refreshes the map through the same-origin /v1 proxy', async () => {
    server.use(
      http.get('*/v1/showtimes/7/seats', ({ request }) => {
        expect(new URL(request.url).origin).toBe(window.location.origin)
        return HttpResponse.json(seatMap((seat) => (seat.id === 1 ? { status: 'sold' } : {})))
      }),
    )
    const { queryClient } = renderPicker()

    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.catalog.seatMap(7) }))

    await waitFor(() => expect(seatButton('A', 1)).toHaveAccessibleName('Row A, seat 1, $11.00, sold'))
  })

  it('sends a guest to sign in and back to this showtime', async () => {
    const user = userEvent.setup()
    renderPicker()

    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
    await user.click(seatButton('A', 1))
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    expect(push).toHaveBeenCalledWith('/login?next=%2Fshowtimes%2F7')
  })

  it('shows a canceled showtime as such, with no seat to pick', async () => {
    const user = userEvent.setup()
    renderPicker({ canceled: true })

    expect(screen.getByText('This showtime was canceled.')).toBeInTheDocument()
    expect(seatButton('A', 1)).toHaveAttribute('aria-disabled', 'true')
    await user.click(seatButton('A', 1))
    expect(seatButton('A', 1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
  })

  it('closes sales once the showtime has started', () => {
    renderPicker({ startsAt: PAST })

    expect(screen.getByText('This showtime has started.')).toBeInTheDocument()
    expect(seatButton('A', 1)).toHaveAttribute('aria-disabled', 'true')
  })
})
