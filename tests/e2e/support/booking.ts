import { expect, type APIRequestContext, type Page } from '@playwright/test'
import type { Account } from './auth'

// Helpers for the booking specs, against the real local API. Specs run in parallel on the same catalog, so each
// picks a random showtime of tomorrow and random free seats: two specs rarely want the same seat.

export interface Showtime {
  id: number
  starts_at: string
  movie: { id: number; title: string }
  seats_available: number
}

export interface Seat {
  id: number
  row: string
  number: number
  status: string
}

export interface Booking {
  id: string
  status: string
  created_at: string
  expires_at: string
  seats: { id: number; row: string; number: number }[]
}

function random<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** A random showtime of tomorrow (bookable all day) with at least `minFree` free seats. */
export async function bookableShowtime(request: APIRequestContext, minFree = 10): Promise<Showtime> {
  const today = (await (await request.get('/v1/showtimes')).json()) as { date: string }
  const date = new Date(`${today.date}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  const schedule = (await (await request.get(`/v1/showtimes?date=${date.toISOString().slice(0, 10)}`)).json()) as {
    items: Showtime[]
  }
  const candidates = schedule.items.filter((showtime) => showtime.seats_available >= minFree)
  expect(candidates.length, 'tomorrow has showtimes with free seats').toBeGreaterThan(0)
  return random(candidates)
}

/** `count` random free seats of a showtime, as the API sees them now. */
export async function freeSeats(request: APIRequestContext, showtimeId: number, count: number): Promise<Seat[]> {
  const map = (await (await request.get(`/v1/showtimes/${showtimeId}/seats`)).json()) as { seats: Seat[] }
  const free = map.seats.filter((seat) => seat.status === 'available')
  const picked: Seat[] = []
  while (picked.length < count && free.length > 0)
    picked.push(...free.splice(Math.floor(Math.random() * free.length), 1))
  expect(picked).toHaveLength(count)
  return picked
}

export async function seatStatus(request: APIRequestContext, showtimeId: number, seatId: number): Promise<string> {
  const map = (await (await request.get(`/v1/showtimes/${showtimeId}/seats`)).json()) as { seats: Seat[] }
  return map.seats.find((seat) => seat.id === seatId)?.status ?? 'missing'
}

/** "C7": how the UI names seats in messages. */
export function seatName(seat: Pick<Seat, 'row' | 'number'>): string {
  return `${seat.row}${seat.number}`
}

/** The seat's button on the map (its accessible name starts with "Row C, seat 7,"). */
export function seatButton(page: Page, seat: Pick<Seat, 'row' | 'number'>) {
  return page.getByRole('group', { name: 'Seats' }).getByRole('button', {
    name: new RegExp(`^Row ${seat.row}, seat ${seat.number},`),
  })
}

export async function pickSeats(page: Page, seats: readonly Seat[]): Promise<void> {
  for (const seat of seats) {
    await seatButton(page, seat).click()
    await expect(seatButton(page, seat)).toHaveAttribute('aria-pressed', 'true')
  }
}

/** Holds the picked seats with "Continue" and waits for the checkout; returns the booking id. */
export async function continueToCheckout(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^Continue/ }).click()
  await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('timer', { name: 'Time left to pay' })).toBeVisible()
  return page.url().split('/').at(-1)!
}

/** Picks what the test card does, and pays. */
export async function payWith(page: Page, label: RegExp): Promise<void> {
  await page.getByRole('radio', { name: label }).click()
  await page.getByRole('button', { name: /^Pay \$/ }).click()
}

/** An access token for calls made next to the browser (the API's view of a booking, a hold made elsewhere). */
export async function apiToken(request: APIRequestContext, account: Account): Promise<string> {
  const response = await request.post('/v1/auth/login', { data: account })
  expect(response.status(), await response.text()).toBe(200)
  return ((await response.json()) as { access_token: string }).access_token
}

/**
 * Console errors worth failing a spec for. Chromium logs every non-2xx answer as "Failed to load resource"; the
 * booking specs provoke some on purpose (a declined card, a taken seat), so those are left out.
 */
export function collectUnexpectedErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (/Failed to load resource: the server responded with a status of (402|409|410|422|503)/.test(message.text())) {
      return
    }
    errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/** Holds seats next to the browser, as the account's other device would; returns the booking. */
export async function holdThroughApi(
  request: APIRequestContext,
  token: string,
  showtimeId: number,
  seats: readonly Pick<Seat, 'id'>[],
): Promise<Booking> {
  const response = await request.post('/v1/bookings', {
    headers: { Authorization: `Bearer ${token}` },
    data: { showtime_id: showtimeId, seat_ids: seats.map((seat) => seat.id) },
  })
  expect(response.status(), await response.text()).toBe(201)
  return (await response.json()) as Booking
}

/** Pays for a booking next to the browser with a test card token (`tok_success` by default). */
export async function payThroughApi(
  request: APIRequestContext,
  token: string,
  bookingId: string,
  paymentToken = 'tok_success',
): Promise<void> {
  const response = await request.post(`/v1/bookings/${bookingId}/payments`, {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
    data: { payment_method: 'local', payment_token: paymentToken },
  })
  expect(response.status(), await response.text()).toBe(200)
}

/** Releases a hold next to the browser. */
export async function cancelThroughApi(request: APIRequestContext, token: string, bookingId: string): Promise<void> {
  const response = await request.delete(`/v1/bookings/${bookingId}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(response.status(), await response.text()).toBe(204)
}
