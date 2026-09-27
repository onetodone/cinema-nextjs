import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Booking, PaymentMethod } from '@/lib/api/types'
import { resetServerClock } from '@/lib/server-clock'
import { deferred } from '@/test/auth'
import { BOOKING_ID, makeBooking, paymentResult, problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { CheckoutView } from './checkout-view'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

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

const LOCAL: PaymentMethod = { id: 'local', name: 'Test card' }

interface PayCall {
  key: string | null
  body: unknown
}

let payments: PayCall[]
let bookingReads: number
let methodReads: number

/**
 * The API: GET the booking answers `bookings` in turn (the last one repeats), GET payment methods answers `methods`,
 * and POST payments answers `answers` in turn (the last one repeats).
 */
function api({
  bookings = [makeBooking()],
  methods = [LOCAL],
  answers = [],
}: {
  bookings?: Booking[]
  methods?: PaymentMethod[]
  answers?: ((call: PayCall) => Response | Promise<Response>)[]
}) {
  server.use(
    http.get(`*/v1/bookings/${BOOKING_ID}`, () => {
      bookingReads++
      return HttpResponse.json(bookings[Math.min(bookingReads, bookings.length) - 1])
    }),
    http.get('*/v1/payment-methods', () => {
      methodReads++
      return HttpResponse.json({ items: methods })
    }),
    http.post(`*/v1/bookings/${BOOKING_ID}/payments`, async ({ request }) => {
      const call = { key: request.headers.get('Idempotency-Key'), body: await request.json() }
      payments.push(call)
      return answers[Math.min(payments.length, answers.length) - 1](call)
    }),
  )
}

const paid = makeBooking({ status: 'paid', paid_at: new Date().toISOString() })
const processing = makeBooking({ status: 'processing' })

const answer200 = () => HttpResponse.json(paymentResult(paid, 'succeeded'))
const answer202 = () =>
  HttpResponse.json(paymentResult(processing, 'pending'), {
    status: 202,
    headers: { Location: `/v1/bookings/${BOOKING_ID}` },
  })

function renderCheckout(bookingId = BOOKING_ID) {
  return renderWithQueryClient(<CheckoutView bookingId={bookingId} />)
}

/** Picks a test token (when given) once the methods are there, and presses Pay. */
async function payWith(token: RegExp | null = null) {
  const user = userEvent.setup()
  if (token) await user.click(await screen.findByRole('radio', { name: token }))
  const button = await screen.findByRole('button', { name: /^Pay \$/ })
  await waitFor(() => expect(button).toBeEnabled())
  await user.click(button)
  return user
}

function storedAttempt() {
  const raw = sessionStorage.getItem(`cinema:pay:${BOOKING_ID}`)
  return raw === null ? null : JSON.parse(raw)
}

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockReset())
  Object.values(toast).forEach((fn) => fn.mockReset())
  sync.postSyncMessage.mockReset()
  resetServerClock()
  payments = []
  bookingReads = 0
  methodReads = 0
})

describe('CheckoutView', () => {
  it('shows what is held, the time left, and the test card', async () => {
    api({})
    renderCheckout()

    expect(await screen.findByRole('heading', { name: 'Orbit of Glass' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Time left to pay' })).toHaveTextContent(/^1[45]:\d\d$/)
    expect(screen.getByText('Row A, seat 4')).toBeInTheDocument()
    expect(screen.getByText('$22.00')).toBeInTheDocument()
    expect(await screen.findByRole('radio', { name: /^Pays tok_success/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Pay $22.00' })).toBeEnabled()
  })

  it('200: stores the attempt before sending, then opens the ticket', async () => {
    const pending = deferred<Response>()
    api({ answers: [() => pending.promise] })
    renderCheckout()

    await payWith()

    expect(screen.getByRole('button', { name: /Paying…/ })).toBeDisabled()
    await waitFor(() => expect(payments).toHaveLength(1))
    expect(payments[0]).toEqual({
      key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      body: { payment_method: 'local', payment_token: 'tok_success' },
    })
    expect(storedAttempt()).toEqual({ idempotencyKey: payments[0].key, method: 'local', token: 'tok_success' })

    pending.resolve(answer200())
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(toast.success).toHaveBeenCalledWith('Payment complete. Enjoy the movie!', { id: 'paid' })
    expect(storedAttempt()).toBeNull()
    expect(sync.postSyncMessage).toHaveBeenCalledWith({
      type: 'bookings-changed',
      bookingId: BOOKING_ID,
      showtimeId: 7,
    })
  })

  it('402: says why the card was declined; the next attempt gets a new key', async () => {
    api({
      answers: [
        () => problemResponse(402, 'PAYMENT_DECLINED', { extra: { decline_code: 'insufficient_funds' } }),
        answer200,
      ],
    })
    renderCheckout()

    await payWith(/^Insufficient funds/)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Payment declined')
    expect(alert).toHaveTextContent('The card was declined for insufficient funds. Nothing was charged')
    expect(storedAttempt()).toBeNull()
    expect(screen.getByRole('timer')).toBeInTheDocument()

    await payWith(/^Pays tok_success/)
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(payments[1].key).not.toBe(payments[0].key)
    expect(payments[1].body).toEqual({ payment_method: 'local', payment_token: 'tok_success' })
  })

  it('202: follows the booking while the payment is in flight, until it is paid', async () => {
    api({ bookings: [makeBooking(), processing, paid], answers: [answer202] })
    renderCheckout()

    await payWith(/^Provider error/)

    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument()
    expect(storedAttempt()).toBeNull()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`), { timeout: 6_000 })
  }, 10_000)

  it('202: a payment that settles without a charge leaves the booking payable, and says so', async () => {
    api({ bookings: [makeBooking(), makeBooking()], answers: [answer202] })
    renderCheckout()

    await payWith(/^No answer/)

    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument()
    expect(await screen.findByRole('alert', {}, { timeout: 4_000 })).toHaveTextContent(
      'The payment provider didn’t complete it, and nothing was charged.',
    )
    expect(screen.getByRole('button', { name: 'Pay $22.00' })).toBeEnabled()
  }, 10_000)

  it('PAYMENT_IN_PROGRESS: another payment is in flight, so it is followed like a 202', async () => {
    api({ bookings: [makeBooking(), processing], answers: [() => problemResponse(409, 'PAYMENT_IN_PROGRESS')] })
    renderCheckout()

    await payWith()

    expect(await screen.findByText('Confirming your payment…')).toBeInTheDocument()
  })

  it('BOOKING_ALREADY_PAID: opens the ticket', async () => {
    api({ bookings: [makeBooking(), paid], answers: [() => problemResponse(409, 'BOOKING_ALREADY_PAID')] })
    renderCheckout()

    await payWith()

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
  })

  it('BOOKING_CANCELED: the hold is closed, with the way back to the seats', async () => {
    api({ answers: [() => problemResponse(409, 'BOOKING_CANCELED')] })
    renderCheckout()

    await payWith()

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('This hold was canceled')
    expect(within(notice).getByRole('link', { name: 'Choose seats again' })).toHaveAttribute('href', '/showtimes/7')
  })

  it('PAYMENT_REFUNDED: says the late charge went back', async () => {
    api({
      bookings: [makeBooking(), makeBooking({ status: 'expired' })],
      answers: [() => problemResponse(409, 'PAYMENT_REFUNDED')],
    })
    renderCheckout()

    await payWith()

    expect(await screen.findByText('Your payment was refunded')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose seats again' })).toBeInTheDocument()
  })

  it('BOOKING_BUSY and IDEMPOTENCY_IN_PROGRESS: sent again with the same key after Retry-After', async () => {
    api({
      answers: [
        () => problemResponse(409, 'IDEMPOTENCY_IN_PROGRESS', { headers: { 'Retry-After': '0' } }),
        () => problemResponse(409, 'BOOKING_BUSY', { headers: { 'Retry-After': '0' } }),
        answer200,
      ],
    })
    renderCheckout()

    await payWith()

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(payments).toHaveLength(3)
    expect(new Set(payments.map((call) => call.key)).size).toBe(1)
  })

  it('410 BOOKING_EXPIRED: the hold is over', async () => {
    api({ answers: [() => problemResponse(410, 'BOOKING_EXPIRED')] })
    renderCheckout()

    await payWith()

    expect(await screen.findByText('Your hold has expired')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument()
  })

  it('422 PAYMENT_METHOD_UNAVAILABLE: asks for another method and refetches the list', async () => {
    api({ answers: [() => problemResponse(422, 'PAYMENT_METHOD_UNAVAILABLE')] })
    renderCheckout()

    await payWith()

    expect(await screen.findByRole('alert')).toHaveTextContent('This payment method is no longer available')
    await waitFor(() => expect(methodReads).toBe(2))
  })

  it('503: the provider is down, nothing was charged; the next attempt gets a new key', async () => {
    api({
      answers: [
        () => problemResponse(503, 'PAYMENT_PROVIDER_UNAVAILABLE', { headers: { 'Retry-After': '5' } }),
        answer200,
      ],
    })
    renderCheckout()

    await payWith(/^Provider down/)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The payment provider is unavailableNothing was charged. Please try again in 5 seconds.',
    )
    await payWith(/^Provider down/)
    await waitFor(() => expect(payments).toHaveLength(2))
    expect(payments[1].key).not.toBe(payments[0].key)
  })

  it('no answer: "Retry payment" sends the same attempt again, safely', async () => {
    api({ answers: [() => HttpResponse.error(), answer200] })
    renderCheckout()

    await payWith()

    expect(await screen.findByRole('alert')).toHaveTextContent('We didn’t hear back about your payment')
    expect(storedAttempt()).toEqual({ idempotencyKey: payments[0].key, method: 'local', token: 'tok_success' })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry payment' }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(payments[1].key).toBe(payments[0].key)
  })

  it('a reload during a payment sends the same attempt again and shows the answer the API replays', async () => {
    sessionStorage.setItem(
      `cinema:pay:${BOOKING_ID}`,
      JSON.stringify({ idempotencyKey: 'key-before-reload', method: 'local', token: 'tok_slow' }),
    )
    const replay = deferred<Response>()
    api({ bookings: [processing], answers: [() => replay.promise] })
    renderCheckout()

    await waitFor(() =>
      expect(payments).toEqual([
        { key: 'key-before-reload', body: { payment_method: 'local', payment_token: 'tok_slow' } },
      ]),
    )
    replay.resolve(HttpResponse.json(paymentResult(paid, 'succeeded'), { headers: { 'Idempotent-Replayed': 'true' } }))

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(storedAttempt()).toBeNull()
  })

  it('a reload after a decline shows the replayed decline, and the booking stays payable', async () => {
    sessionStorage.setItem(
      `cinema:pay:${BOOKING_ID}`,
      JSON.stringify({ idempotencyKey: 'key-before-reload', method: 'local', token: 'tok_declined' }),
    )
    api({
      answers: [
        () =>
          problemResponse(402, 'PAYMENT_DECLINED', {
            extra: { decline_code: 'card_declined' },
            headers: { 'Idempotent-Replayed': 'true' },
          }),
      ],
    })
    renderCheckout()

    expect(await screen.findByRole('alert')).toHaveTextContent('Payment declined')
    expect(payments[0].key).toBe('key-before-reload')
    expect(await screen.findByRole('button', { name: 'Pay $22.00' })).toBeEnabled()
  })

  it('warns in the last two minutes, and closes the hold when its time is up', async () => {
    const now = Date.now()
    api({
      bookings: [
        makeBooking({
          created_at: new Date(now - 13 * 60_000).toISOString(),
          expires_at: new Date(now + 90_000).toISOString(),
        }),
      ],
    })
    const { unmount } = renderCheckout()

    expect(await screen.findByText('Your hold ends soon')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/^1:[23]\d$/)
    unmount()

    server.resetHandlers()
    bookingReads = 0
    api({
      bookings: [
        makeBooking({
          created_at: new Date(now - 15 * 60_000).toISOString(),
          expires_at: new Date(now - 1_000).toISOString(),
        }),
      ],
    })
    renderCheckout()
    expect(await screen.findByText('Your hold has expired')).toBeInTheDocument()
  })

  it('cancels the hold after a confirmation, and goes back to the seats', async () => {
    const deleted: string[] = []
    api({})
    server.use(
      http.delete('*/v1/bookings/:id', ({ params }) => {
        deleted.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderCheckout()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Cancel hold' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Release your seats?' })
    expect(dialog).toHaveTextContent('A4 and A5 go back on sale at once')
    await user.click(within(dialog).getByRole('button', { name: 'Release seats' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/showtimes/7'))
    expect(deleted).toEqual([BOOKING_ID])
    expect(toast.success).toHaveBeenCalledWith('Your seats were released.', { id: 'released' })
  })

  it('lists a method this app does not know as unsupported, never with a token field', async () => {
    api({ methods: [{ id: 'stripe', name: 'Card' }] })
    renderCheckout()

    expect(await screen.findByText('(not supported by this app)')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay $22.00' })).toBeDisabled()
  })

  it('opens the ticket of a paid booking, without a "payment complete" toast', async () => {
    api({ bookings: [paid] })
    renderCheckout()

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('says "not found" for an unknown booking, and for an id that cannot be one without asking', async () => {
    server.use(http.get(`*/v1/bookings/${BOOKING_ID}`, () => problemResponse(404, 'NOT_FOUND')))
    const { unmount } = renderCheckout()
    expect(await screen.findByRole('heading', { name: 'Booking not found' })).toBeInTheDocument()
    unmount()

    renderCheckout('not-a-booking')
    expect(screen.getByRole('heading', { name: 'Booking not found' })).toBeInTheDocument()
  })
})
