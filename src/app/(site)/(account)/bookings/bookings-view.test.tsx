import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '@/lib/api/types'
import { makeBooking, problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { BookingsView } from './bookings-view'

vi.mock('@/lib/auth/session', () => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
}))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const id = (n: number) => `0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a${String(n).padStart(2, '0')}`
const showtime = (starts_at: string) => ({ ...makeBooking().showtime, starts_at })
const FUTURE = '2999-01-01T19:30:00+02:00'
const PAST = '2020-01-01T19:30:00+02:00'

interface ListCall {
  status: string[]
  cursor: string | null
  limit: string | null
}

let calls: ListCall[]

/**
 * `GET /v1/bookings`: the unpaid list (`status=pending,processing`) answers `holds` in turn (the last one repeats);
 * the history answers its pages by cursor, from `history` in turn (the last one repeats).
 */
function api({
  holds = [[]],
  history = [[{ items: [] }]],
}: {
  holds?: Booking[][]
  history?: ({ items: Booking[]; next_cursor?: string } | Response)[][]
}) {
  let holdReads = 0
  let historyReads = 0
  server.use(
    http.get('*/v1/bookings', ({ request }) => {
      const params = new URL(request.url).searchParams
      const call = { status: params.getAll('status'), cursor: params.get('cursor'), limit: params.get('limit') }
      calls.push(call)
      if (call.status.includes('pending')) {
        holdReads++
        return HttpResponse.json({ items: holds[Math.min(holdReads, holds.length) - 1] })
      }
      if (call.cursor === null) historyReads++
      const pages = history[Math.min(historyReads, history.length) - 1]
      const page = pages[call.cursor === null ? 0 : Number(call.cursor)]
      return page instanceof Response ? page : HttpResponse.json(page)
    }),
  )
}

beforeEach(() => {
  calls = []
})

describe('BookingsView', () => {
  it('shows holds, tickets to come, and past bookings, each leading to the right place', async () => {
    const hold = makeBooking({ id: id(1), expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
    const ticket = makeBooking({ id: id(2), status: 'paid', showtime: showtime(FUTURE) })
    const seen = makeBooking({ id: id(3), status: 'paid', showtime: showtime(PAST) })
    const canceled = makeBooking({ id: id(4), status: 'canceled', showtime: showtime(FUTURE) })
    api({ holds: [[hold]], history: [[{ items: [ticket, seen, canceled] }]] })
    renderWithQueryClient(<BookingsView />)

    const holds = await screen.findByRole('region', { name: 'Awaiting payment' })
    const holdLink = within(holds).getByRole('link', { name: 'Orbit of Glass, Tuesday, January 1 at 7:30 PM' })
    expect(holdLink).toHaveAttribute('href', `/checkout/${id(1)}`)
    expect(within(holds).getByText('Awaiting payment', { selector: '[data-slot="badge"]' })).toBeInTheDocument()
    expect(holds).toHaveTextContent(/Held for (10:00|9:5\d) more · \$22\.00 to pay/)

    const upcoming = screen.getByRole('region', { name: 'Upcoming' })
    expect(within(upcoming).getByRole('link')).toHaveAttribute('href', `/bookings/${id(2)}`)
    expect(upcoming).toHaveTextContent('7:30 PM · Hall 1 · Seats A4 and A5')
    expect(upcoming).toHaveTextContent('2 seats · $22.00')
    expect(within(upcoming).getByText('Paid')).toBeInTheDocument()

    const past = screen.getByRole('region', { name: 'Past & canceled' })
    expect(
      within(past)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/bookings/${id(3)}`, `/bookings/${id(4)}`])
    expect(within(past).getByText('Canceled')).toBeInTheDocument()
    expect(past).toHaveTextContent('2 seats · nothing charged')

    expect(calls).toEqual([
      { status: ['pending', 'processing'], cursor: null, limit: '100' },
      { status: ['paid', 'expired', 'canceled'], cursor: null, limit: '20' },
    ])
    expect(screen.queryByRole('button', { name: 'Load older bookings' })).not.toBeInTheDocument()
  })

  it('says so when there are no bookings at all, and leads to the schedule', async () => {
    api({})
    renderWithQueryClient(<BookingsView />)

    expect(await screen.findByText('No bookings yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the schedule' })).toHaveAttribute('href', '/schedule')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('says there are no tickets to come when every booking is over', async () => {
    api({ history: [[{ items: [makeBooking({ id: id(1), status: 'expired' })] }]] })
    renderWithQueryClient(<BookingsView />)

    const upcoming = await screen.findByRole('region', { name: 'Upcoming' })
    expect(within(upcoming).getByText('No upcoming tickets')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Past & canceled' })).getByText('Expired')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Awaiting payment' })).not.toBeInTheDocument()
  })

  it('loads older bookings with the cursor, and moves focus to the first new one', async () => {
    const first = makeBooking({ id: id(1), status: 'canceled' })
    const second = makeBooking({ id: id(2), status: 'expired' })
    api({ history: [[{ items: [first], next_cursor: '1' }, { items: [second] }]] })
    const user = userEvent.setup()
    renderWithQueryClient(<BookingsView />)

    await user.click(await screen.findByRole('button', { name: 'Load older bookings' }))

    const links = await screen.findAllByRole('link', { name: /^Orbit of Glass/ })
    expect(links).toHaveLength(2)
    await waitFor(() => expect(links[1]).toHaveFocus())
    expect(links[1]).toHaveAttribute('href', `/bookings/${id(2)}`)
    expect(calls.at(-1)).toEqual({ status: ['paid', 'expired', 'canceled'], cursor: '1', limit: '20' })
    expect(screen.queryByRole('button', { name: 'Load older bookings' })).not.toBeInTheDocument()
    expect(screen.getByText('2 bookings shown')).toBeInTheDocument()
  })

  it('says when an older page fails, and keeps what it has', async () => {
    api({
      history: [
        [
          { items: [makeBooking({ id: id(1), status: 'canceled' })], next_cursor: '1' },
          problemResponse(500, 'INTERNAL'),
        ],
      ],
    })
    const user = userEvent.setup()
    renderWithQueryClient(<BookingsView />)

    await user.click(await screen.findByRole('button', { name: 'Load older bookings' }))

    expect(await screen.findByText("We couldn't load more bookings. Please try again.")).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Orbit of Glass/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Load older bookings' })).toBeEnabled()
  })

  it('offers to try again when the bookings cannot be loaded', async () => {
    api({
      history: [[problemResponse(500, 'INTERNAL')], [{ items: [makeBooking({ id: id(1), status: 'canceled' })] }]],
    })
    const user = userEvent.setup()
    renderWithQueryClient(<BookingsView />)

    expect(await screen.findByText("We couldn't load your bookings.")).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('region', { name: 'Past & canceled' })).toBeInTheDocument()
  })

  it('shows a hold whose time ran out as ended, and follows it into the past once the API releases it', async () => {
    const now = Date.now()
    const hold = makeBooking({
      id: id(1),
      created_at: new Date(now - 15 * 60_000).toISOString(),
      expires_at: new Date(now + 1_200).toISOString(),
    })
    api({
      // The worker has not released it at the first look after the deadline; it has at the next one.
      holds: [[hold], [hold], []],
      history: [[{ items: [] }], [{ items: [{ ...hold, status: 'expired' }] }]],
    })
    renderWithQueryClient(<BookingsView />)

    const holds = await screen.findByRole('region', { name: 'Awaiting payment' })
    expect(within(holds).getByRole('link')).toHaveAttribute('href', `/checkout/${id(1)}`)

    expect(
      await within(holds).findByText('The hold ran out — the seats go back on sale', undefined, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(within(holds).getByRole('link')).toHaveAttribute('href', `/bookings/${id(1)}`)
    expect(within(holds).getByText('Expired')).toBeInTheDocument()

    const past = await screen.findByRole('region', { name: 'Past & canceled' }, { timeout: 8_000 })
    expect(within(past).getByRole('link')).toHaveAttribute('href', `/bookings/${id(1)}`)
    expect(screen.queryByRole('region', { name: 'Awaiting payment' })).not.toBeInTheDocument()
  }, 12_000)
})
