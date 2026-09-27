import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, Seat, SeatMap } from '@/lib/api/types'
import type { SessionSnapshot } from '@/lib/auth/session'
import { queryKeys } from '@/lib/queries/keys'
import { MAX_SEATS_PER_BOOKING } from '@/lib/seat-map'
import { ANN } from '@/test/auth'
import { BOOKING_ID, makeBooking, OTHER_BOOKING_ID, problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { SeatPicker } from '@/components/seat-map/seat-picker'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const auth = vi.hoisted(() => ({ snapshot: { status: 'unauthenticated', user: null } as SessionSnapshot }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth.snapshot }))
vi.mock('@/lib/auth/session', () => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
}))

const sync = vi.hoisted(() => ({ postSyncMessage: vi.fn(), subscribeSyncMessages: () => () => {} }))
vi.mock('@/lib/sync', () => sync)

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())
beforeEach(() => {
  push.mockReset()
  Object.values(toast).forEach((fn) => fn.mockReset())
  sync.postSyncMessage.mockReset()
  auth.snapshot = { status: 'unauthenticated', user: null }
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

function renderPicker(
  props: { initial?: SeatMap; startsAt?: string; canceled?: boolean; startedWhenFetched?: boolean } = {},
) {
  return renderWithQueryClient(
    <SeatPicker
      showtimeId={7}
      startsAt={props.startsAt ?? FUTURE}
      canceled={props.canceled ?? false}
      startedWhenFetched={props.startedWhenFetched}
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

  it('sends a guest to sign in and back to this showtime, keeping the pick in this tab', async () => {
    const user = userEvent.setup()
    renderPicker()

    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
    await user.click(seatButton('A', 1))
    await user.click(seatButton('A', 2))
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    expect(push).toHaveBeenCalledWith('/login?next=%2Fshowtimes%2F7')
    expect(JSON.parse(sessionStorage.getItem('cinema:selection:7')!)).toEqual({ seatIds: [1, 2] })
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

  it('closes sales from the first render when the server saw the showtime start', () => {
    renderPicker({ startsAt: PAST, startedWhenFetched: true })

    expect(screen.getByText('This showtime has started.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
  })

  it('says when every seat is sold or held, and that held seats may come back', () => {
    renderPicker({ initial: seatMap((seat) => ({ status: seat.id % 2 === 0 ? 'held' : 'sold' })) })

    expect(screen.getByRole('status')).toHaveTextContent(
      "This showtime is sold out.Seats on hold go back on sale if they aren't paid for in time",
    )
    expect(screen.getByText(/0 of 12 seats free/)).toBeInTheDocument()
  })
})

describe('SeatPicker: holding seats', () => {
  interface HoldCall {
    key: string | null
    authorization: string | null
    body: unknown
  }

  let holds: HoldCall[]
  let seatMapReads: number

  /** The API for a signed-in user with no hold yet; `answers` answer the holds in turn (the last one repeats). */
  function api(answers: ((call: HoldCall) => Response | Promise<Response>)[], active: Booking[] = []) {
    server.use(
      http.get('*/v1/bookings', () => HttpResponse.json({ items: active })),
      http.get('*/v1/showtimes/7/seats', () => {
        seatMapReads++
        return HttpResponse.json(seatMap())
      }),
      http.post('*/v1/bookings', async ({ request }) => {
        const call = {
          key: request.headers.get('Idempotency-Key'),
          authorization: request.headers.get('Authorization'),
          body: await request.json(),
        }
        holds.push(call)
        return answers[Math.min(holds.length, answers.length) - 1](call)
      }),
    )
  }

  const created =
    (booking = makeBooking()) =>
    () =>
      HttpResponse.json(booking, { status: 201 })

  async function pickAndContinue(
    seats: [string, number][] = [
      ['A', 4],
      ['A', 5],
    ],
  ) {
    const user = userEvent.setup()
    for (const [row, number] of seats) await user.click(seatButton(row, number))
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    return user
  }

  beforeEach(() => {
    auth.snapshot = { status: 'authenticated', user: ANN }
    holds = []
    seatMapReads = 0
  })

  it('holds the picked seats with a new key, tells the other tabs, and opens the checkout', async () => {
    const booking = makeBooking()
    api([created(booking)])
    const { queryClient } = renderPicker()

    await pickAndContinue()

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/checkout/${BOOKING_ID}`))
    expect(holds).toEqual([
      {
        key: expect.stringMatching(/^[0-9a-f-]{36}$/),
        authorization: 'Bearer access-token',
        body: { showtime_id: 7, seat_ids: [4, 5] },
      },
    ])
    expect(sync.postSyncMessage).toHaveBeenCalledWith({
      type: 'bookings-changed',
      bookingId: BOOKING_ID,
      showtimeId: 7,
    })
    // The checkout opens with the booking at hand, and this page (kept by Next) no longer shows the pick.
    expect(queryClient.getQueryData(queryKeys.private.booking(BOOKING_ID))).toEqual(booking)
    expect(screen.getByText('No seats picked')).toBeInTheDocument()
  })

  it('marks seats that someone else took, drops them, and refreshes the map', async () => {
    api([() => problemResponse(409, 'SEAT_UNAVAILABLE', { extra: { unavailable_seat_ids: [5] } })])
    renderPicker()

    await pickAndContinue()

    await waitFor(() => expect(seatButton('A', 5)).toHaveAccessibleName('Row A, seat 5, $11.00, just taken'))
    expect(screen.getByText('1 seat · $11.00')).toBeInTheDocument()
    expect(toast.warning).toHaveBeenCalledWith('Seat A5 was just taken', expect.objectContaining({ id: 'seats-taken' }))
    await waitFor(() => expect(seatMapReads).toBe(1))
    expect(push).not.toHaveBeenCalled()
  })

  it('tries busy seats once more with the same key, then leaves the retry to the viewer (same key again)', async () => {
    api([() => problemResponse(409, 'SEAT_BUSY', { headers: { 'Retry-After': '0' } })])
    renderPicker()

    const user = await pickAndContinue()

    expect(await screen.findByRole('alert')).toHaveTextContent('These seats are being booked right now.')
    expect(holds).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    await waitFor(() => expect(holds).toHaveLength(4))
    expect(new Set(holds.map((call) => call.key)).size).toBe(1)
  })

  it('keeps the key after a lost answer, and changes it when the pick changes', async () => {
    api([() => HttpResponse.error(), () => HttpResponse.error(), created()])
    renderPicker()

    const user = await pickAndContinue()
    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the cinema’s server.')
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    await waitFor(() => expect(holds).toHaveLength(2))
    expect(holds[1].key).toBe(holds[0].key)

    await user.click(seatButton('B', 1))
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/checkout/${BOOKING_ID}`))
    expect(holds[2].key).not.toBe(holds[0].key)
    expect(holds[2].body).toEqual({ showtime_id: 7, seat_ids: [4, 5, 7] })
  })

  it('offers the checkout of an unpaid booking the API names (ACTIVE_BOOKING_EXISTS)', async () => {
    const other = makeBooking({
      id: OTHER_BOOKING_ID,
      seats: [{ id: 1, row: 'A', number: 1, type: 'standard', price_cents: 1100 }],
    })
    api([() => problemResponse(409, 'ACTIVE_BOOKING_EXISTS', { extra: { booking_id: OTHER_BOOKING_ID } })])
    server.use(http.get(`*/v1/bookings/${OTHER_BOOKING_ID}`, () => HttpResponse.json(other)))
    renderPicker()

    const user = await pickAndContinue()

    const dialog = await screen.findByRole('alertdialog', { name: 'You already hold seats for this showtime' })
    await waitFor(() => expect(dialog).toHaveTextContent(/You hold A1 \(1[45]:\d\d left\)/))
    expect(dialog).toHaveTextContent('release them and hold A4 and A5 instead')
    await user.click(within(dialog).getByRole('button', { name: 'Go to checkout' }))
    expect(push).toHaveBeenCalledWith(`/checkout/${OTHER_BOOKING_ID}`)
  })

  it('releases the earlier booking and holds the new pick, with a new key', async () => {
    const other = makeBooking({ id: OTHER_BOOKING_ID })
    const deleted: string[] = []
    api([() => problemResponse(409, 'ACTIVE_BOOKING_EXISTS', { extra: { booking_id: OTHER_BOOKING_ID } }), created()])
    server.use(
      http.get(`*/v1/bookings/${OTHER_BOOKING_ID}`, () => HttpResponse.json(other)),
      http.delete('*/v1/bookings/:id', ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPicker()

    const user = await pickAndContinue([['B', 1]])
    await user.click(await screen.findByRole('button', { name: 'Hold new seats instead' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/checkout/${BOOKING_ID}`))
    expect(deleted).toEqual([OTHER_BOOKING_ID])
    expect(holds).toHaveLength(2)
    expect(holds[1].key).not.toBe(holds[0].key)
  })

  it('shows the viewer’s own hold, and asks before holding more seats of this showtime', async () => {
    const mine = makeBooking({ id: OTHER_BOOKING_ID })
    api([created()], [mine])
    renderPicker({ initial: seatMap((seat) => (seat.id === 4 || seat.id === 5 ? { status: 'held' } : {})) })

    expect(await screen.findByText("You're holding A4 and A5.")).toBeInTheDocument()
    expect(seatButton('A', 4)).toHaveAccessibleName('Row A, seat 4, $11.00, held by you')
    expect(screen.getByRole('link', { name: 'Go to checkout' })).toHaveAttribute(
      'href',
      `/checkout/${OTHER_BOOKING_ID}`,
    )

    await pickAndContinue([['B', 2]])

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(holds).toEqual([])
  })

  it('closes sales when the API says the showtime is not bookable', async () => {
    api([() => problemResponse(409, 'SHOWTIME_NOT_BOOKABLE')])
    renderPicker()

    await pickAndContinue()

    expect(await screen.findByText('Sales for this showtime are closed.')).toBeInTheDocument()
    expect(seatButton('B', 1)).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled()
  })

  it('says when the showtime no longer exists', async () => {
    api([() => problemResponse(404, 'SHOWTIME_NOT_FOUND')])
    renderPicker()

    await pickAndContinue()

    expect(await screen.findByText('This showtime no longer exists.')).toBeInTheDocument()
  })

  it('refreshes the map when seats are not part of the hall any more (UNKNOWN_SEAT)', async () => {
    api([() => problemResponse(422, 'UNKNOWN_SEAT')])
    renderPicker()

    await pickAndContinue()

    await waitFor(() => expect(seatMapReads).toBe(1))
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/don’t exist in this hall/), { id: 'hold-failed' })
  })

  it('says how long to wait after too many attempts', async () => {
    api([() => problemResponse(429, 'RATE_LIMITED', { headers: { 'Retry-After': '30' } })])
    renderPicker()

    await pickAndContinue()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please try again in 30 seconds.')
  })

  it('sends the pick through sign-in when the session has ended', async () => {
    api([() => problemResponse(401, 'TOKEN_EXPIRED')])
    renderPicker()

    await pickAndContinue()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?next=%2Fshowtimes%2F7'))
    expect(JSON.parse(sessionStorage.getItem('cinema:selection:7')!)).toEqual({ seatIds: [4, 5] })
  })

  it('picks a saved selection again after sign-in, without seats taken meanwhile', async () => {
    api([created()])
    sessionStorage.setItem('cinema:selection:7', JSON.stringify({ seatIds: [4, 5] }))
    renderPicker({ initial: seatMap((seat) => (seat.id === 5 ? { status: 'sold' } : {})) })

    await waitFor(() => expect(seatButton('A', 4)).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByText('1 seat · $11.00')).toBeInTheDocument()
    expect(toast.warning).toHaveBeenCalledWith(
      'Seat A5 was taken while you were away',
      expect.objectContaining({ id: 'seats-taken' }),
    )
    expect(sessionStorage.getItem('cinema:selection:7')).toBeNull()
  })
})
