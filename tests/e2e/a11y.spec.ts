import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'
import { accountButton, newAccount, signInThroughUi } from './support/auth'
import {
  apiToken,
  bookableShowtime,
  cancelThroughApi,
  collectUnexpectedErrors,
  continueToCheckout,
  freeSeats,
  holdThroughApi,
  pickSeats,
} from './support/booking'

// The accessibility pass: a whole booking with the keyboard alone, where focus goes after navigations and dialogs,
// reduced motion, and axe on what the other specs do not scan (dialogs and menus, phone widths, not-found pages).

/** Whether the element shows a focus indicator: an outline, or a Tailwind ring (a box-shadow with a spread). */
function hasFocusIndicator(element: Element): boolean {
  const style = getComputedStyle(element)
  const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
  return outline || /\s0px 0px 0px [1-9]/.test(style.boxShadow)
}

/**
 * Presses Tab until `target` has focus — proof that it is reachable with the keyboard in a sane number of steps — and
 * checks that it shows where focus is.
 */
async function tabTo(page: Page, target: Locator, maxSteps = 150): Promise<void> {
  await target.waitFor()
  for (let step = 0; step < maxSteps; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeFocused()
      await expect.poll(() => target.evaluate(hasFocusIndicator), { message: 'a visible focus indicator' }).toBe(true)
      return
    }
    await page.keyboard.press('Tab')
  }
  throw new Error(`${target} was not reached with ${maxSteps} presses of Tab`)
}

/** The page's main heading, which takes focus after a client-side navigation (hidden, kept pages are left out). */
function pageHeading(page: Page) {
  return page.getByRole('main').getByRole('heading', { level: 1 })
}

test.describe('accessibility', () => {
  test('a booking made with the keyboard alone: home → schedule → seats → sign in → pay → ticket', async ({
    page,
    request,
    baseURL,
  }) => {
    const errors = collectUnexpectedErrors(page)
    const foreignCalls: string[] = []
    page.on('request', (request) => {
      const kind = request.resourceType()
      if ((kind === 'fetch' || kind === 'xhr') && new URL(request.url()).origin !== new URL(baseURL!).origin) {
        foreignCalls.push(request.url())
      }
    })
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const date = showtime.starts_at.slice(0, 10)

    // The skip link is the first stop, and leads past the header.
    await page.goto('/')
    // "Sign in" replaces its placeholder once the page is hydrated: from then on, links navigate on the client.
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    expect((await skip.boundingBox())?.width).toBeGreaterThan(40)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: "Today's schedule" })).toBeFocused()

    // A navigation puts focus on the new page's heading.
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/schedule')
    await expect(pageHeading(page)).toBeFocused()

    // Another day changes only the query string: focus stays on the day.
    const tomorrow = page.locator(`nav[aria-label="Days"] a[href="/schedule?date=${date}"]`)
    await tabTo(page, tomorrow)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/schedule?date=${date}`)
    await expect(tomorrow).toHaveAttribute('aria-current', 'date')
    await expect(tomorrow).toBeFocused()

    await tabTo(page, page.locator(`main a[href="/showtimes/${showtime.id}"]`))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/showtimes/${showtime.id}`)
    await expect(pageHeading(page)).toBeFocused()
    await expect(pageHeading(page)).toHaveText(showtime.movie.title)

    // The map is one tab stop, on the first free seat; Space picks, the arrow keys move.
    const seats = page.getByRole('group', { name: 'Seats' })
    await tabTo(page, seats.locator('button[tabindex="0"]'))
    const picked: string[] = []
    for (let move = 0; move < 12 && picked.length < 2; move++) {
      const focused = seats.locator('button:focus')
      if ((await focused.getAttribute('aria-disabled')) !== 'true') {
        const name = (await focused.getAttribute('aria-label'))!.replace(/, available$/, '')
        await page.keyboard.press('Space')
        await expect(focused).toHaveAttribute('aria-pressed', 'true')
        picked.push(name)
      }
      await page.keyboard.press('ArrowRight')
    }
    expect(picked.length).toBeGreaterThan(0)

    // A guest's "Continue" leads through sign-in and back, with the pick kept.
    await tabTo(page, page.getByRole('button', { name: /^Continue/ }))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/login?next=%2Fshowtimes%2F${showtime.id}`)
    await expect(pageHeading(page)).toBeFocused()
    await tabTo(page, page.getByLabel('Email'))
    await page.keyboard.type(account.email)
    await tabTo(page, page.getByLabel('Password'))
    await page.keyboard.type(account.password)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/showtimes/${showtime.id}`)
    for (const name of picked) {
      await expect(seats.getByRole('button', { name: `${name}, selected`, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }

    await tabTo(page, page.getByRole('button', { name: /^Continue/ }))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/checkout\/[0-9a-f-]{36}$/)
    const bookingId = page.url().split('/').at(-1)!
    await expect(pageHeading(page)).toHaveText('Checkout')
    await expect(pageHeading(page)).toBeFocused()

    // A dialog takes focus, and gives it back to what opened it.
    const cancelHold = page.getByRole('button', { name: 'Cancel hold' })
    await tabTo(page, cancelHold)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog', { name: 'Release your seats?' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(cancelHold).toBeFocused()

    // The test card's first outcome (it pays) is picked already; Shift+Tab walks back to it, the arrows change it.
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Shift+Tab')
    const pays = page.getByRole('radio', { name: /^Pays tok_success/ })
    await expect(pays).toBeFocused()
    await expect(pays).toBeChecked()
    await tabTo(page, page.getByRole('button', { name: /^Pay \$/ }))
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(`/bookings/${bookingId}`)
    await expect(pageHeading(page)).toHaveText('Your ticket')
    await expect(pageHeading(page)).toBeFocused()
    await expect(page.getByRole('img', { name: `Ticket code for booking ${bookingId}` })).toBeVisible()
    // Every API call went through the app's own origin (the /v1 proxy).
    expect(foreignCalls).toEqual([])
    expect(errors).toEqual([])
  })

  test('the header and the account menu work with the keyboard, and focus comes back where it was', async ({
    page,
    request,
  }) => {
    const account = await newAccount(request)
    await signInThroughUi(page, account, '/login?next=%2Fschedule')
    await expect(page).toHaveURL('/schedule')

    await tabTo(page, page.getByRole('link', { name: 'Movies', exact: true }))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/movies')
    await expect(pageHeading(page)).toBeFocused()

    const menuButton = accountButton(page, account)
    await tabTo(page, menuButton)
    await page.keyboard.press('Enter')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect.poll(() => menu.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    // Like every popup, the menu lives in a portal at the end of the body, outside the landmarks: axe's best-practice
    // "region" rule does not apply to it (dialogs are exempt by their role; menus are not).
    const results = await new AxeBuilder({ page }).disableRules(['region']).analyze()
    expect(results.violations, 'open menu').toEqual([])
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(menuButton).toBeFocused()

    // As in the WAI-ARIA menu button pattern, the arrow key opens the menu on its first item.
    await page.keyboard.press('ArrowDown')
    await expect(menu).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'My bookings' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/bookings')
    await expect(pageHeading(page)).toBeFocused()
  })

  test('reduced motion stops animations and transitions; otherwise they run', async ({ page }) => {
    /** The computed durations of an element carrying Tailwind's spin animation and a transition. */
    const durations = () =>
      page.evaluate(() => {
        const element = document.createElement('div')
        element.className = 'animate-spin transition-all'
        document.body.append(element)
        const style = getComputedStyle(element)
        const result = {
          animation: parseFloat(style.animationDuration),
          transition: parseFloat(style.transitionDuration),
        }
        element.remove()
        return result
      })

    await page.goto('/')
    // Polled: the theme provider switches transitions off for a moment while it applies the theme.
    await expect.poll(durations).toEqual({ animation: 1, transition: 0.15 })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await durations()
    expect(reduced.animation).toBeLessThan(0.001)
    expect(reduced.transition).toBeLessThan(0.001)
  })

  test('dialogs and phone-sized pages have no detectable a11y violations, and pages never scroll sideways', async ({
    page,
    request,
  }) => {
    const account = await newAccount(request)
    const token = await apiToken(request, account)
    const showtime = await bookableShowtime(request)
    const [held, heldLater, other] = await freeSeats(request, showtime.id, 3)
    const firstHold = await holdThroughApi(request, token, showtime.id, [held])

    /** Axe finds nothing, and the page itself never scrolls sideways (the seat map scrolls inside its frame). */
    async function checkPage(path: string) {
      await page.goto(path)
      await expect(pageHeading(page)).toBeVisible()
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0)
      expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([])
    }

    // 320 CSS pixels: WCAG's reflow width.
    await page.setViewportSize({ width: 320, height: 640 })
    for (const path of ['/login', '/register']) await checkPage(path)
    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await expect(page.getByText(/^You're holding/)).toBeVisible()
    // The hold strip under the header, on phones.
    await expect(page.getByRole('link', { name: /^Seats .* held, \d+:\d\d left/ })).toBeVisible()

    for (const path of [
      '/',
      '/movies',
      `/movies/${showtime.movie.id}`,
      '/schedule',
      `/showtimes/${showtime.id}`,
      '/bookings',
      '/account',
    ]) {
      await checkPage(path)
    }

    // The "you already hold seats" dialog, over the seat map. A new hold: with the test API's 30-second holds, the
    // first one may have run out by now.
    await cancelThroughApi(request, token, firstHold.id)
    await holdThroughApi(request, token, showtime.id, [heldLater])
    await page.goto(`/showtimes/${showtime.id}`)
    // The account menu and the notice come after hydration and the session check: the seats respond by then.
    await expect(accountButton(page, account)).toBeVisible()
    await expect(page.getByText(/^You're holding/)).toBeVisible()
    await pickSeats(page, [other])
    await page.getByRole('button', { name: /^Continue/ }).click()
    await expect(page.getByRole('alertdialog', { name: 'You already hold seats for this showtime' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations, 'active booking dialog').toEqual([])
    await page.keyboard.press('Escape')

    // The checkout, and its "Release your seats?" dialog.
    await page.getByRole('link', { name: 'Go to checkout' }).click()
    await expect(page.getByRole('timer', { name: 'Time left to pay' })).toBeVisible()
    // "Pay" fades in once the payment methods are there; mid-fade its colours are not the final ones.
    const pay = page.getByRole('button', { name: /^Pay \$/ })
    await expect(pay).toBeEnabled()
    await expect.poll(() => pay.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    expect((await new AxeBuilder({ page }).analyze()).violations, 'checkout').toEqual([])
    await page.getByRole('button', { name: 'Cancel hold' }).click()
    await expect(page.getByRole('alertdialog', { name: 'Release your seats?' })).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations, 'cancel hold dialog').toEqual([])
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`not-found pages have no detectable a11y violations, and keep the navigation (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme })
      for (const [path, heading] of [
        ['/no-such-page', 'Page not found'],
        ['/movies/999999999', 'Movie not found'],
        ['/showtimes/999999999', 'Showtime not found'],
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
        expect((await new AxeBuilder({ page }).analyze()).violations, path).toEqual([])
      }
    })
  }

  test('on a phone, the strip under the header leads back to the checkout of a hold', async ({ page, request }) => {
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    await page.setViewportSize({ width: 390, height: 844 })
    await signInThroughUi(page, account, `/login?next=%2Fshowtimes%2F${showtime.id}`)
    await pickSeats(page, [seat])
    const bookingId = await continueToCheckout(page)

    await page.goto('/movies')
    const strip = page.getByRole('link', { name: /^Seats .* held, \d+:\d\d left/ })
    await tabTo(page, strip)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/checkout/${bookingId}`)
    await expect(pageHeading(page)).toBeFocused()
  })
})
