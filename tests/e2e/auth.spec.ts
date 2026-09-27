import AxeBuilder from '@axe-core/playwright'
import { expect, stubThirdParty, test } from './support/test'
import {
  accountButton,
  collectConsoleErrors,
  cookieNamed,
  newAccount,
  signInThroughUi,
  trackAuthCalls,
} from './support/auth'

// Sign-in, sessions, and tabs against the real local API (see README → Testing). Pages of one browser context share
// cookies, BroadcastChannel, and Web Locks, as tabs do; separate contexts are separate browsers ("devices").
//
// Two specs depend on the API's settings: the one about tokens expiring together needs a short JWT_TTL (≤ 60s) and is
// skipped otherwise; the reuse-detection spec waits out REFRESH_GRACE (E2E_REFRESH_GRACE_SECONDS, default 30).

const REFRESH_GRACE_S = Number(process.env.E2E_REFRESH_GRACE_SECONDS ?? '30')

test.describe('auth', () => {
  test('a guest browses without a single auth call', async ({ page, context }) => {
    const calls = trackAuthCalls(context)

    for (const path of ['/', '/movies', '/schedule']) {
      await page.goto(path)
      await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    }
    await page.waitForLoadState('networkidle')

    expect(calls).toEqual([])
    expect(await context.cookies()).toEqual([])
  })

  test('registering signs in and returns to where the visitor was; a reload keeps the session', async ({
    page,
    context,
  }) => {
    const errors = collectConsoleErrors(page)
    const calls = trackAuthCalls(context)
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

    await page.goto('/schedule')
    await page.getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/login?next=%2Fschedule')
    await page.getByRole('link', { name: 'Create an account' }).click()
    await expect(page).toHaveURL('/register?next=%2Fschedule')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('e2e-auth-password')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL('/schedule')
    await expect(page.getByRole('button', { name: `Account: ${email}` })).toBeVisible()
    await expect.poll(() => calls).toEqual(['POST /v1/auth/register 201', 'POST /v1/auth/login 200'])

    // The refresh token is out of reach of scripts; the hint holds no secret; nothing sits in web storage.
    const refresh = await cookieNamed(context, 'cinema_refresh')
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/v1/auth' })
    const hint = await cookieNamed(context, 'cinema_signed_in')
    expect(hint).toMatchObject({ httpOnly: false, path: '/', sameSite: 'Lax' })
    expect(Number(hint!.value)).toBeGreaterThan(Date.now())
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(storage).not.toMatch(/eyJ/)

    await page.reload()
    await expect(page.getByRole('button', { name: `Account: ${email}` })).toBeVisible()
    await expect.poll(() => calls.slice(2)).toEqual(['POST /v1/auth/refresh 200'])
    expect(errors).toEqual([])
  })

  test('a sign-in reaches every open tab, and a new tab takes the token without refreshing', async ({
    context,
    request,
  }) => {
    const account = await newAccount(request)
    const first = await context.newPage()
    const second = await context.newPage()
    await second.goto('/movies')
    await expect(second.getByRole('link', { name: 'Sign in' })).toBeVisible()
    const calls = trackAuthCalls(context)

    await signInThroughUi(first, account)
    await expect(accountButton(second, account)).toBeVisible()

    const third = await context.newPage()
    await third.goto('/account')
    await expect(third.getByText(account.email)).toBeVisible()
    await expect(third.getByText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/)).toBeVisible()
    await third.waitForLoadState('networkidle')
    expect(calls).toEqual(['POST /v1/auth/login 200'])
  })

  test('a sign-out in one tab signs out the others, and a private page goes to sign-in', async ({
    context,
    request,
  }) => {
    const account = await newAccount(request)
    const first = await context.newPage()
    await signInThroughUi(first, account)
    const second = await context.newPage()
    await second.goto('/account')
    await expect(second.getByText(account.email)).toBeVisible()

    await accountButton(first, account).click()
    await first.getByRole('menuitem', { name: 'Sign out' }).click()

    await expect(first.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(second).toHaveURL('/login?next=%2Faccount')
    await expect(second.getByText('You signed out in another tab.')).toBeVisible()
    await expect.poll(async () => (await context.cookies()).map((cookie) => cookie.name)).toEqual([])

    // The login page brings the next user back to the account page.
    await second.getByLabel('Email').fill(account.email)
    await second.getByLabel('Password').fill(account.password)
    await second.getByRole('button', { name: 'Sign in' }).click()
    await expect(second).toHaveURL('/account')
  })

  test('an invalid refresh cookie makes a quiet guest', async ({ page, context }) => {
    await context.addCookies([
      { name: 'cinema_refresh', value: 'not-a-session.secret', domain: 'localhost', path: '/v1/auth' },
      { name: 'cinema_signed_in', value: '1', domain: 'localhost', path: '/' },
    ])
    const calls = trackAuthCalls(context)

    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect.poll(() => calls).toEqual(['POST /v1/auth/refresh 401'])
    await expect.poll(async () => (await context.cookies()).map((cookie) => cookie.name)).toEqual([])
    await expect(page.getByText('Your session has ended')).toHaveCount(0)
  })

  test('a refused access token is refreshed once and the request replayed', async ({ page, context, request }) => {
    const account = await newAccount(request)
    await signInThroughUi(page, account)
    const calls = trackAuthCalls(context)
    let refused = false
    await page.route('**/v1/me', async (route) => {
      if (refused) return route.continue()
      refused = true
      await route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
        body: JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'TOKEN_EXPIRED' }),
      })
    })

    await accountButton(page, account).click()
    await page.getByRole('menuitem', { name: 'Account' }).click()

    await expect(page).toHaveURL('/account')
    await expect(page.getByText(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/)).toBeVisible()
    expect(refused).toBe(true)
    await expect.poll(() => calls).toEqual(['POST /v1/auth/refresh 200'])
  })

  test('a network blip keeps the session', async ({ page, context, request }) => {
    const account = await newAccount(request)
    await signInThroughUi(page, account)
    await page.route('**/v1/auth/refresh', (route) => route.abort('internetdisconnected'))

    await page.goto('/account')

    await expect(page.getByText("We couldn't check your sign-in.")).toBeVisible()
    expect(await cookieNamed(context, 'cinema_signed_in')).toBeDefined()
    expect(await cookieNamed(context, 'cinema_refresh')).toBeDefined()

    await page.unroute('**/v1/auth/refresh')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(account.email)).toBeVisible()
  })

  test('signing out everywhere ends the session on another device at once', async ({ browser, request, baseURL }) => {
    const account = await newAccount(request)
    const laptop = await browser.newContext()
    const phone = await browser.newContext()
    await stubThirdParty(laptop, baseURL)
    await stubThirdParty(phone, baseURL)
    const laptopPage = await laptop.newPage()
    const phonePage = await phone.newPage()
    await signInThroughUi(laptopPage, account)
    await signInThroughUi(phonePage, account)

    await laptopPage.goto('/account')
    await laptopPage.getByRole('button', { name: 'Sign out everywhere' }).click()
    await laptopPage.getByRole('alertdialog').getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(laptopPage).toHaveURL('/login?next=%2Faccount')

    // The phone still holds an access token, but the API refuses it at once, and its refresh cookie too.
    await accountButton(phonePage, account).click()
    await phonePage.getByRole('menuitem', { name: 'Account' }).click()
    await expect(phonePage).toHaveURL('/login?next=%2Faccount')
    await expect(phonePage.getByText('Your session has ended. Please sign in again.')).toBeVisible()

    await laptop.close()
    await phone.close()
  })

  test('replaying an old refresh cookie after the grace window ends the session', async ({
    page,
    context,
    request,
    playwright,
    baseURL,
  }) => {
    test.setTimeout((REFRESH_GRACE_S + 60) * 1000)
    const account = await newAccount(request)
    await signInThroughUi(page, account)
    const stolen = (await cookieNamed(context, 'cinema_refresh'))!.value

    // A reload refreshes, which rotates the cookie; the old value is now only the previous one.
    await page.reload()
    await expect(accountButton(page, account)).toBeVisible()
    await expect.poll(async () => (await cookieNamed(context, 'cinema_refresh'))?.value).not.toBe(stolen)

    await page.waitForTimeout((REFRESH_GRACE_S + 1) * 1000)
    const attacker = await playwright.request.newContext({ baseURL })
    const replay = await attacker.post('/v1/auth/refresh', {
      data: {},
      headers: { Cookie: `cinema_refresh=${stolen}` },
    })
    expect(replay.status()).toBe(401)
    await attacker.dispose()

    // Reuse detected: the API revoked the session, so the browser drops to sign-in on its next call.
    await accountButton(page, account).click()
    await page.getByRole('menuitem', { name: 'Account' }).click()
    await expect(page).toHaveURL('/login?next=%2Faccount')
    await expect(page.getByText('Your session has ended. Please sign in again.')).toBeVisible()
  })

  test('tabs whose tokens expire together make one refresh', async ({ context, request }) => {
    const account = await newAccount(request)
    const first = await context.newPage()
    const login = first.waitForResponse((response) => response.url().endsWith('/v1/auth/login'))
    await signInThroughUi(first, account)
    const { expires_in: lifetime } = (await (await login).json()) as { expires_in: number }
    test.skip(lifetime > 60, `needs the API with a short JWT_TTL (≤ 60s); this one issues ${lifetime}s tokens`)
    test.setTimeout((lifetime + 60) * 1000)

    const others = [await context.newPage(), await context.newPage()]
    for (const page of others) {
      await page.goto('/movies')
      await expect(accountButton(page, account)).toBeVisible()
    }
    const calls = trackAuthCalls(context)

    // Every tab schedules its refresh for the same moment (a quarter of the lifetime before expiry). Waiting the
    // whole lifetime covers that moment but not the next one.
    await first.waitForTimeout(lifetime * 1000)

    expect(calls).toEqual(['POST /v1/auth/refresh 200'])
    for (const page of [first, ...others]) {
      await page.goto('/account')
      await expect(page.getByText(account.email)).toBeVisible()
    }
    expect(calls).toEqual(['POST /v1/auth/refresh 200'])
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the sign-in, registration, and account pages have no detectable a11y violations (${colorScheme})`, async ({
      page,
      request,
    }) => {
      await page.emulateMedia({ colorScheme })
      for (const path of ['/login', '/register']) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        // A failed submit shows the field errors, which are part of what gets checked.
        await page.locator('form').getByRole('button').click()
        await expect(page.getByText('Enter your email address.')).toBeVisible()
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      }

      const account = await newAccount(request)
      await signInThroughUi(page, account)
      await page.goto('/account')
      await expect(page.getByText(account.email)).toBeVisible()
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await accountButton(page, account).click()
      await expect(page.getByRole('menu')).toBeVisible()
      // The menu is portalled to <body>, outside the landmarks, as popups are: the `region` rule does not apply.
      const menu = await new AxeBuilder({ page }).include('[role="menu"]').disableRules(['region']).analyze()
      expect(menu.violations).toEqual([])
    })
  }
})
