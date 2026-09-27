import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Booking } from '@/lib/api/types'
import { readPaymentAttempt, startPaymentAttempt } from '@/lib/payments/attempt'
import { BOOKING_ID, makeBooking, problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { TicketView } from './ticket-view'

vi.mock('@/lib/auth/session', () => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
}))

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const sync = vi.hoisted(() => ({ postSyncMessage: vi.fn(), subscribeSyncMessages: () => () => {} }))
vi.mock('@/lib/sync', () => sync)

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
  toast.success.mockReset()
  toast.error.mockReset()
})
afterAll(() => server.close())

function renderBooking(booking: Booking) {
  server.use(http.get(`*/v1/bookings/${BOOKING_ID}`, () => HttpResponse.json(booking)))
  return renderWithQueryClient(<TicketView bookingId={BOOKING_ID} />)
}

describe('TicketView', () => {
  it('shows a paid booking as a ticket: a code for the entrance, when, where, which seats, and the receipt', async () => {
    renderBooking(makeBooking({ status: 'paid', paid_at: '2026-09-27T12:00:00Z' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Your ticket' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings')
    expect(screen.getByText('Paid')).toBeInTheDocument()
    const ticket = screen.getByRole('region', { name: 'Orbit of Glass' })
    const code = within(ticket).getByRole('img', { name: `Ticket code for booking ${BOOKING_ID}` })
    expect(code.querySelector('path')?.getAttribute('d')).toMatch(/^M4 4h7v1h-7z/)
    expect(within(ticket).getByText('Hall 1')).toBeInTheDocument()
    expect(within(ticket).getByText('7:30 PM')).toBeInTheDocument()
    expect(within(ticket).getByText('A4 and A5')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Receipt' })).toHaveTextContent('Total · 2 seats$22.00')
    expect(screen.getByText('Paid on September 27, 2026.')).toBeInTheDocument()
  })

  it('leads an unpaid booking back to its checkout', async () => {
    renderBooking(makeBooking())

    expect(await screen.findByText('Waiting for your payment')).toBeInTheDocument()
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue to checkout' })).toHaveAttribute(
      'href',
      `/checkout/${BOOKING_ID}`,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('releases the seats of an unpaid booking after a confirmation, and shows it canceled', async () => {
    let reads = 0
    let deletes = 0
    server.use(
      http.get(`*/v1/bookings/${BOOKING_ID}`, () => {
        reads++
        return HttpResponse.json(makeBooking({ status: deletes > 0 ? 'canceled' : 'pending' }))
      }),
      http.delete(`*/v1/bookings/${BOOKING_ID}`, () => {
        deletes++
        return new HttpResponse(null, { status: 204 })
      }),
    )
    startPaymentAttempt(BOOKING_ID, 'local', 'tok_declined')
    const user = userEvent.setup()
    renderWithQueryClient(<TicketView bookingId={BOOKING_ID} />)

    await user.click(await screen.findByRole('button', { name: 'Cancel hold' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Release your seats?' })
    expect(dialog).toHaveTextContent('A4 and A5 go back on sale at once')
    await user.click(within(dialog).getByRole('button', { name: 'Release seats' }))

    expect(await screen.findByText('This booking was canceled')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(deletes).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('Your seats were released.', { id: 'released' })
    expect(readPaymentAttempt(BOOKING_ID)).toBeNull()
    expect(sync.postSyncMessage).toHaveBeenCalledWith({
      type: 'bookings-changed',
      bookingId: BOOKING_ID,
      showtimeId: 7,
    })
    await waitFor(() => expect(reads).toBe(2))
  })

  it('keeps the hold and says why when releasing it fails; a payment in flight cannot be released', async () => {
    server.use(
      http.get(`*/v1/bookings/${BOOKING_ID}`, () => HttpResponse.json(makeBooking())),
      http.delete(`*/v1/bookings/${BOOKING_ID}`, () => problemResponse(409, 'BOOKING_NOT_CANCELABLE')),
    )
    const user = userEvent.setup()
    const { unmount } = renderWithQueryClient(<TicketView bookingId={BOOKING_ID} />)

    await user.click(await screen.findByRole('button', { name: 'Cancel hold' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Release seats' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Couldn’t release your seats. This booking can’t be canceled any more.',
        {
          id: 'cancel-failed',
        },
      ),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for your payment')).toBeInTheDocument()
    unmount()

    renderBooking(makeBooking({ status: 'processing' }))
    expect(await screen.findByText('Your payment is being processed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel hold' })).not.toBeInTheDocument()
  })

  it('shows an expired or canceled booking as closed, with the way back to the seats', async () => {
    const { unmount } = renderBooking(makeBooking({ status: 'expired' }))
    expect(await screen.findByText('This hold expired before it was paid')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose seats again' })).toHaveAttribute('href', '/showtimes/7')
    unmount()

    renderBooking(makeBooking({ status: 'canceled' }))
    expect(await screen.findByText('This booking was canceled')).toBeInTheDocument()
  })

  it('says "not found" for an unknown booking', async () => {
    server.use(http.get(`*/v1/bookings/${BOOKING_ID}`, () => problemResponse(404, 'NOT_FOUND')))
    renderWithQueryClient(<TicketView bookingId={BOOKING_ID} />)

    expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument()
  })
})
