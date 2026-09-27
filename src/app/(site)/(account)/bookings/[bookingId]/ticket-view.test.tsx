import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Booking } from '@/lib/api/types'
import { BOOKING_ID, makeBooking, problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { TicketView } from './ticket-view'

vi.mock('@/lib/auth/session', () => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
}))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderBooking(booking: Booking) {
  server.use(http.get(`*/v1/bookings/${BOOKING_ID}`, () => HttpResponse.json(booking)))
  return renderWithQueryClient(<TicketView bookingId={BOOKING_ID} />)
}

describe('TicketView', () => {
  it('shows a paid booking as a ticket: a code for the entrance, when, where, which seats, and the receipt', async () => {
    renderBooking(makeBooking({ status: 'paid', paid_at: '2026-09-27T12:00:00Z' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Your ticket' })).toBeInTheDocument()
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
