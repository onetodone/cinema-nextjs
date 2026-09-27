import AxeBuilder from '@axe-core/playwright'
import type { Locator, Request } from '@playwright/test'
import { expect, stubThirdParty, test } from './support/test'
import { accountButton, newAccount, signInThroughUi } from './support/auth'
import {
  apiToken,
  bookableShowtime,
  collectUnexpectedErrors,
  continueToCheckout,
  freeSeats,
  payWith,
  pickSeats,
  seatButton,
  seatName,
  seatStatus,
  type Booking,
} from './support/booking'

// Holding seats and paying for them, against the real local API with its local test payment provider
// (PAYMENT_LOCAL_ENABLED=true). See README → Testing.
//
// Two specs depend on the API's settings and its worker (`make run-worker`), and skip otherwise:
// - the expiry spec needs holds of at most a minute (BOOKING_HOLD_TTL=30s); it measures the hold length itself;
// - the settlement spec needs E2E_PAYMENT_SETTLE_SECONDS, how long the worker takes to settle a payment the provider
//   did not answer (about PAYMENT_GRACE + RECONCILER_INTERVAL).

const SETTLE_SECONDS = Number(process.env.E2E_PAYMENT_SETTLE_SECONDS ?? '0')

/** Waits until a button is enabled and done fading in (buttons dim while disabled, with a transition). */
async function settled(button: Locator) {
  await expect(button).toBeEnabled()
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
}

/** The Idempotency-Key of every payment request the page sends, in order. */
function trackPaymentKeys(requests: Request[]) {
  return () =>
    requests
      .filter((request) => request.method() === 'POST' && /\/v1\/bookings\/[^/]+\/payments$/.test(request.url()))
      .map((request) => request.headers()['idempotency-key'])
}

test.describe('booking', () => {
  test('a guest’s pick survives sign-in; hold → pay with the test card → ticket', async ({ page, request }) => {
    const errors = collectUnexpectedErrors(page)
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const seats = await freeSeats(request, showtime.id, 2)

    await page.goto(`/showtimes/${showtime.id}`)
    await pickSeats(page, seats)
    await page.getByRole('button', { name: /^Continue/ }).click()

    await expect(page).toHaveURL(`/login?next=%2Fshowtimes%2F${showtime.id}`)
    await page.getByLabel('Email').fill(account.email)
    await page.getByLabel('Password').fill(account.password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(`/showtimes/${showtime.id}`)
    for (const seat of seats) await expect(seatButton(page, seat)).toHaveAttribute('aria-pressed', 'true')
    const bookingId = await continueToCheckout(page)
    await expect(page.getByRole('heading', { name: showtime.movie.title })).toBeVisible()
    await expect(page.getByRole('timer')).toHaveText(/^1[45]:\d\d$|^0:[0-5]\d$/)

    await payWith(page, /^Pays tok_success/)

    await expect(page).toHaveURL(`/bookings/${bookingId}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Your ticket' })).toBeVisible()
    await expect(page.getByRole('img', { name: `Ticket code for booking ${bookingId}` })).toBeVisible()
    await expect(page.getByText('Payment complete. Enjoy the movie!')).toBeVisible()
    for (const seat of seats) expect(await seatStatus(request, showtime.id, seat.id)).toBe('sold')
    expect(errors).toEqual([])
  })

  test('a declined card leaves the hold payable; the next attempt, with a new key, pays', async ({ page, request }) => {
    const errors = collectUnexpectedErrors(page)
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    const requests: Request[] = []
    page.on('request', (sent) => requests.push(sent))
    const paymentKeys = trackPaymentKeys(requests)

    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [seat])
    const bookingId = await continueToCheckout(page)

    await payWith(page, /^Insufficient funds/)
    await expect(page.getByText('The card was declined for insufficient funds.')).toBeVisible()
    await expect(page).toHaveURL(`/checkout/${bookingId}`)
    await expect(page.getByRole('timer')).toBeVisible()

    await payWith(page, /^Pays tok_success/)
    await expect(page).toHaveURL(`/bookings/${bookingId}`)
    const keys = paymentKeys()
    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
    expect(errors).toEqual([])
  })

  test('two browsers want the same seat: one gets the checkout, the other sees it taken', async ({
    browser,
    request,
    baseURL,
  }) => {
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    const [ann, bob] = [await newAccount(request), await newAccount(request)]
    const annContext = await browser.newContext()
    const bobContext = await browser.newContext()
    await stubThirdParty(annContext, baseURL)
    await stubThirdParty(bobContext, baseURL)
    try {
      const annPage = await annContext.newPage()
      const bobPage = await bobContext.newPage()
      await signInThroughUi(annPage, ann, `/login?next=%2Fshowtimes%2F${showtime.id}`)
      await signInThroughUi(bobPage, bob, `/login?next=%2Fshowtimes%2F${showtime.id}`)
      await pickSeats(annPage, [seat])
      await pickSeats(bobPage, [seat])

      await continueToCheckout(annPage)
      await bobPage.getByRole('button', { name: /^Continue/ }).click()

      await expect(bobPage.getByText(`Seat ${seatName(seat)} was just taken`)).toBeVisible()
      await expect(seatButton(bobPage, seat)).toHaveAttribute('aria-pressed', 'false')
      await expect(seatButton(bobPage, seat)).toHaveAccessibleName(/(just taken|on hold)$/)
      await expect(bobPage).toHaveURL(`/showtimes/${showtime.id}`)
    } finally {
      await annContext.close()
      await bobContext.close()
    }
  })

  test('a reload during a payment sends the same key again and shows the replayed answer', async ({
    page,
    request,
  }) => {
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    const requests: Request[] = []
    page.on('request', (sent) => requests.push(sent))
    const paymentKeys = trackPaymentKeys(requests)
    const replayed = page.waitForResponse(
      (response) => /\/payments$/.test(response.url()) && response.headers()['idempotent-replayed'] === 'true',
    )

    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [seat])
    const bookingId = await continueToCheckout(page)
    // tok_slow answers after about 5 s: reload while the provider is still at work.
    await payWith(page, /^Pays slowly/)
    await expect(page.getByRole('button', { name: 'Paying…' })).toBeVisible()
    await expect.poll(paymentKeys).toHaveLength(1)
    await page.reload()

    await expect(page).toHaveURL(`/bookings/${bookingId}`, { timeout: 20_000 })
    expect((await replayed).status()).toBe(200)
    const keys = paymentKeys()
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(new Set(keys).size).toBe(1)
  })

  test('the hold pill, holding other seats instead, and canceling a hold', async ({ page, request }) => {
    const errors = collectUnexpectedErrors(page)
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [first, second] = await freeSeats(request, showtime.id, 2)

    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [first])
    const firstId = await continueToCheckout(page)

    // Elsewhere on the site, the header leads back to the checkout.
    await page.getByRole('link', { name: 'Movies', exact: true }).click()
    const pill = page.getByRole('link', { name: new RegExp(`^Seats ${seatName(first)} held, \\d+:\\d\\d left`) })
    await expect(pill).toBeVisible()
    await pill.click()
    await expect(page).toHaveURL(`/checkout/${firstId}`)
    await expect(pill).toBeHidden()

    // Back on the map the held seat is the viewer's; picking another asks which to keep.
    await page.getByRole('link', { name: 'Back to seats' }).click()
    await expect(page.getByText(`You're holding ${seatName(first)}.`)).toBeVisible()
    await expect(seatButton(page, first)).toHaveAccessibleName(/held by you$/)
    await pickSeats(page, [second])
    await page.getByRole('button', { name: /^Continue/ }).click()
    const dialog = page.getByRole('alertdialog', { name: 'You already hold seats for this showtime' })
    await expect(dialog).toContainText(`release them and hold ${seatName(second)} instead`)
    await dialog.getByRole('button', { name: 'Hold new seats instead' }).click()

    await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/)
    const secondId = page.url().split('/').at(-1)
    expect(secondId).not.toBe(firstId)
    await expect(page.getByText(`Row ${second.row}, seat ${second.number}`)).toBeVisible()
    expect(await seatStatus(request, showtime.id, first.id)).toBe('available')

    await page.getByRole('button', { name: 'Cancel hold' }).click()
    await page
      .getByRole('alertdialog', { name: 'Release your seats?' })
      .getByRole('button', { name: 'Release seats' })
      .click()
    await expect(page).toHaveURL(`/showtimes/${showtime.id}`)
    await expect(page.getByText('Your seats were released.')).toBeVisible()
    await expect(page.getByRole('link', { name: /held,/ })).toBeHidden()
    expect(await seatStatus(request, showtime.id, second.id)).toBe('available')
    expect(errors).toEqual([])
  })

  test('tabs follow each other: a hold and a payment in one tab show up in the other', async ({ context, request }) => {
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    const first = await context.newPage()
    await signInThroughUi(first, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    const second = await context.newPage()
    await second.goto('/movies')
    await expect(accountButton(second, account)).toBeVisible()
    const pill = second.getByRole('link', { name: /^Seats .* held, / })
    await expect(pill).toBeHidden()

    await pickSeats(first, [seat])
    await continueToCheckout(first)
    await expect(pill).toBeVisible()

    await payWith(first, /^Pays tok_success/)
    await expect(first).toHaveURL(/\/bookings\//)
    await expect(pill).toBeHidden()
  })

  test('a hold that runs out closes the checkout, and its seats go back on sale', async ({ page, request }) => {
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [probe, seat] = await freeSeats(request, showtime.id, 2)

    // Measure the API's hold length with a hold made next to the browser, then release it.
    const auth = { Authorization: `Bearer ${await apiToken(request, account)}` }
    const hold = await request.post('/v1/bookings', {
      headers: auth,
      data: { showtime_id: showtime.id, seat_ids: [probe.id] },
    })
    expect(hold.status(), await hold.text()).toBe(201)
    const measured = (await hold.json()) as Booking
    await request.delete(`/v1/bookings/${measured.id}`, { headers: auth })
    const holdSeconds = (Date.parse(measured.expires_at) - Date.parse(measured.created_at)) / 1000
    test.skip(
      holdSeconds > 60,
      `needs BOOKING_HOLD_TTL of at most 60s and the worker (the API holds for ${holdSeconds}s)`,
    )
    test.setTimeout((holdSeconds + 60) * 1000)

    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [seat])
    await continueToCheckout(page)

    await expect(page.getByText('Your hold has expired')).toBeVisible({ timeout: (holdSeconds + 5) * 1000 })
    await page.getByRole('link', { name: 'Choose seats again' }).click()
    await expect(page).toHaveURL(`/showtimes/${showtime.id}`)
    // The worker releases the seats within seconds; the map polls every 5 s.
    await expect(seatButton(page, seat)).toHaveAccessibleName(/available$/, { timeout: 20_000 })
  })

  test('a payment the provider does not answer (202) is followed until the worker settles it', async ({
    page,
    request,
  }) => {
    test.skip(!SETTLE_SECONDS, 'needs the worker and E2E_PAYMENT_SETTLE_SECONDS (short PAYMENT_GRACE)')
    test.setTimeout((SETTLE_SECONDS + 60) * 1000)
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)

    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [seat])
    await continueToCheckout(page)
    await payWith(page, /^Provider error/)

    await expect(page.getByText('Confirming your payment…')).toBeVisible()
    await expect(accountButton(page, account)).toBeVisible()
    // The local provider never charged it: the worker settles it as failed, and the booking is payable again.
    await expect(page.getByText('The payment didn’t go through')).toBeVisible({
      timeout: (SETTLE_SECONDS + 15) * 1000,
    })
    await expect(page.getByRole('button', { name: /^Pay \$/ })).toBeEnabled()
    expect(await seatStatus(request, showtime.id, seat.id)).toBe('held')
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`checkout and ticket have no detectable a11y violations (${colorScheme})`, async ({ page, request }) => {
      const account = await newAccount(request)
      const showtime = await bookableShowtime(request)
      const [seat] = await freeSeats(request, showtime.id, 1)
      await page.emulateMedia({ colorScheme })

      await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
      await pickSeats(page, [seat])
      await continueToCheckout(page)
      await expect(page.getByRole('radio', { name: /^Pays tok_success/ })).toBeVisible()
      await settled(page.getByRole('button', { name: /^Pay \$/ }))
      expect((await new AxeBuilder({ page }).analyze()).violations, 'checkout').toEqual([])

      await payWith(page, /^Declined/)
      await expect(page.getByText('Payment declined')).toBeVisible()
      await settled(page.getByRole('button', { name: /^Pay \$/ }))
      expect((await new AxeBuilder({ page }).analyze()).violations, 'declined').toEqual([])

      await payWith(page, /^Pays tok_success/)
      await expect(page.getByRole('heading', { level: 1, name: 'Your ticket' })).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations, 'ticket').toEqual([])
    })
  }
})
