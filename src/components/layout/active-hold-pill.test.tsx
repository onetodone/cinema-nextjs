import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking } from '@/lib/api/types'
import type { SessionSnapshot } from '@/lib/auth/session'
import { ANN } from '@/test/auth'
import { BOOKING_ID, makeBooking, OTHER_BOOKING_ID } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { ActiveHoldPill } from '@/components/layout/active-hold-pill'

const navigation = vi.hoisted(() => ({ pathname: '/movies' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

const auth = vi.hoisted(() => ({ snapshot: { status: 'authenticated', user: null } as SessionSnapshot }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth.snapshot }))
vi.mock('@/lib/auth/session', () => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
}))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

let listReads: number
let statusFilter: string[]

function activeBookings(...lists: Booking[][]) {
  server.use(
    http.get('*/v1/bookings', ({ request }) => {
      listReads++
      statusFilter = new URL(request.url).searchParams.getAll('status')
      return HttpResponse.json({ items: lists[Math.min(listReads, lists.length) - 1] })
    }),
  )
}

beforeEach(() => {
  auth.snapshot = { status: 'authenticated', user: ANN }
  navigation.pathname = '/movies'
  listReads = 0
  statusFilter = []
})

describe('ActiveHoldPill', () => {
  it('leads back to the checkout of the hold that runs out first, with its time left', async () => {
    const now = Date.now()
    activeBookings([
      makeBooking({ id: OTHER_BOOKING_ID, expires_at: new Date(now + 10 * 60_000).toISOString() }),
      makeBooking({ expires_at: new Date(now + 5 * 60_000).toISOString() }),
    ])
    renderWithQueryClient(<ActiveHoldPill />)

    const pill = await screen.findByRole('link', { name: /^Seats A4 and A5 held, [45]:\d\d left\. Open checkout\.$/ })
    expect(pill).toHaveAttribute('href', `/checkout/${BOOKING_ID}`)
    expect(statusFilter).toEqual(['pending', 'processing'])
  })

  it('shows a payment in flight', async () => {
    activeBookings([makeBooking({ status: 'processing' })])
    renderWithQueryClient(<ActiveHoldPill />)

    expect(
      await screen.findByRole('link', { name: 'Payment processing for A4 and A5. Open checkout.' }),
    ).toBeInTheDocument()
  })

  it('stays out of the way on that checkout, for guests, and without a hold', async () => {
    activeBookings([makeBooking()])
    navigation.pathname = `/checkout/${BOOKING_ID}`
    const { unmount } = renderWithQueryClient(<ActiveHoldPill />)
    await waitFor(() => expect(listReads).toBe(1))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    unmount()

    auth.snapshot = { status: 'unauthenticated', user: null }
    renderWithQueryClient(<ActiveHoldPill />).unmount()
    expect(listReads).toBe(1)

    auth.snapshot = { status: 'authenticated', user: ANN }
    navigation.pathname = '/movies'
    activeBookings([])
    renderWithQueryClient(<ActiveHoldPill />)
    await waitFor(() => expect(listReads).toBe(2))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('goes away when the hold runs out, and asks the API again', async () => {
    const now = Date.now()
    activeBookings(
      [
        makeBooking({
          created_at: new Date(now - 15 * 60_000).toISOString(),
          expires_at: new Date(now + 1_500).toISOString(),
        }),
      ],
      [],
    )
    renderWithQueryClient(<ActiveHoldPill />)

    expect(await screen.findByRole('link', { name: /held/ })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link')).not.toBeInTheDocument(), { timeout: 4_000 })
    await waitFor(() => expect(listReads).toBe(2))
  })
})
