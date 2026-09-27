import AxeBuilder from '@axe-core/playwright'
import { expect, stubThirdParty, test } from './support/test'
import { accountButton, collectConsoleErrors, newAccount, signInThroughUi, trackAuthCalls } from './support/auth'
import {
  apiToken,
  bookableShowtime,
  cancelThroughApi,
  freeSeats,
  holdThroughApi,
  payThroughApi,
  seatStatus,
} from './support/booking'

// "My bookings" and the account's sessions, against the real local API (see README → Testing). Bookings are made next
// to the browser through the API (as another device of the account would), on a random showtime of tomorrow. With a
// short BOOKING_HOLD_TTL the held seats must be checked within its length: the specs make the hold last.

test.describe('my bookings', () => {
  test('groups holds, tickets, and past bookings, pages through the history, and releases a hold', async ({
    page,
    request,
  }) => {
    const errors = collectConsoleErrors(page)
    const account = await newAccount(request)
    const token = await apiToken(request, account)
    const showtime = await bookableShowtime(request)
    const [ticketSeat, canceledSeat, heldSeat] = await freeSeats(request, showtime.id, 3)
    const ticket = await holdThroughApi(request, token, showtime.id, [ticketSeat])
    await payThroughApi(request, token, ticket.id)
    const canceled = await holdThroughApi(request, token, showtime.id, [canceledSeat])
    await cancelThroughApi(request, token, canceled.id)

    // The history comes one booking per page here, so its two bookings take two pages.
    const cursors: (string | null)[] = []
    await page.route(
      (url) => url.pathname === '/v1/bookings' && url.searchParams.getAll('status').includes('paid'),
      (route) => {
        const url = new URL(route.request().url())
        cursors.push(url.searchParams.get('cursor'))
        url.searchParams.set('limit', '1')
        return route.continue({ url: url.toString() })
      },
    )

    const held = await holdThroughApi(request, token, showtime.id, [heldSeat])
    await signInThroughUi(page, account)
    await accountButton(page, account).click()
    await page.getByRole('menuitem', { name: 'My bookings' }).click()
    await expect(page).toHaveURL('/bookings')

    const holds = page.getByRole('region', { name: 'Awaiting payment' })
    await expect(holds.getByRole('link')).toHaveAttribute('href', `/checkout/${held.id}`)
    await expect(holds).toContainText(/Held for \d+:\d\d more/)
    const upcoming = page.getByRole('region', { name: 'Upcoming' })
    await expect(upcoming.getByText('No upcoming tickets')).toBeVisible()
    const past = page.getByRole('region', { name: 'Past & canceled' })
    await expect(past.getByRole('link')).toHaveAttribute('href', `/bookings/${canceled.id}`)
    await expect(past.getByText('Canceled', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Load older bookings' }).click()
    await expect(upcoming.getByRole('link')).toHaveAttribute('href', `/bookings/${ticket.id}`)
    await expect(upcoming.getByRole('link')).toBeFocused()
    await expect(upcoming.getByText('Paid', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load older bookings' })).toHaveCount(0)
    expect(cursors).toHaveLength(2)
    expect(cursors[0]).toBeNull()
    expect(cursors[1]).toEqual(expect.any(String))

    // The hold is released from its booking page; back on the list it is past, and its seat is on sale again.
    await page.goto(`/bookings/${held.id}`)
    await page.getByRole('button', { name: 'Cancel hold' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Release seats' }).click()
    await expect(page.getByText('This booking was canceled')).toBeVisible()
    expect(await seatStatus(request, showtime.id, heldSeat.id)).toBe('available')

    await page.getByRole('link', { name: 'My bookings' }).click()
    await expect(page).toHaveURL('/bookings')
    await expect(past.getByRole('link').first()).toHaveAttribute('href', `/bookings/${held.id}`)
    await expect(holds).toHaveCount(0)
    expect(errors).toEqual([])
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`my bookings and the account page have no detectable a11y violations (${colorScheme})`, async ({
      page,
      request,
    }) => {
      const account = await newAccount(request)
      await page.emulateMedia({ colorScheme })

      await signInThroughUi(page, account, '/login?next=%2Fbookings')
      await expect(page.getByText('No bookings yet')).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations, 'empty list').toEqual([])

      const token = await apiToken(request, account)
      const showtime = await bookableShowtime(request)
      const [ticketSeat, heldSeat] = await freeSeats(request, showtime.id, 2)
      const ticket = await holdThroughApi(request, token, showtime.id, [ticketSeat])
      await payThroughApi(request, token, ticket.id)
      await holdThroughApi(request, token, showtime.id, [heldSeat])
      await page.reload()
      await expect(page.getByRole('region', { name: 'Awaiting payment' }).getByRole('link')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Upcoming' }).getByRole('link')).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations, 'list').toEqual([])

      await page.goto('/account')
      // Two sessions: the browser, and the token taken for the API calls above.
      await expect(page.getByRole('listitem')).toHaveCount(2)
      expect((await new AxeBuilder({ page }).analyze()).violations, 'account').toEqual([])
    })
  }
})

test.describe('account sessions', () => {
  test('lists where the account is signed in, and signing out another browser ends its session at once', async ({
    page,
    browser,
    request,
    baseURL,
  }) => {
    const account = await newAccount(request)
    await signInThroughUi(page, account)
    const phone = await browser.newContext()
    await stubThirdParty(phone, baseURL)
    const phonePage = await phone.newPage()
    const phoneCalls = trackAuthCalls(phone)
    await signInThroughUi(phonePage, account)

    await page.goto('/account')
    const sessions = page.getByRole('listitem')
    await expect(sessions).toHaveCount(2)
    const thisOne = sessions.filter({ hasText: 'This device' })
    await expect(thisOne).toContainText('Active now')
    await expect(thisOne.getByRole('button')).toHaveCount(0)
    const other = sessions.filter({ hasNotText: 'This device' })
    await expect(other).toContainText(/Chrome on \w+/)
    await expect(other).toContainText(/Last active (just now|1 minute ago)/)

    await other.getByRole('button', { name: /^Sign out / }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sign out' }).click()
    await expect(sessions).toHaveCount(1)
    await expect(page.getByRole('heading', { name: "Where you're signed in" })).toBeFocused()

    // The phone still holds an unexpired access token, but the API refuses it at once, and its refresh cookie too.
    await accountButton(phonePage, account).click()
    await phonePage.getByRole('menuitem', { name: 'My bookings' }).click()
    await expect(phonePage).toHaveURL('/login?next=%2Fbookings')
    await expect(phonePage.getByText('Your session has ended. Please sign in again.')).toBeVisible()
    expect(phoneCalls).toContain('POST /v1/auth/refresh 401')

    // This browser is still signed in.
    await page.reload()
    await expect(accountButton(page, account)).toBeVisible()
    await expect(sessions).toHaveCount(1)
    await phone.close()
  })
})
