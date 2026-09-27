import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'

// Helpers for specs that sign in against the real local API. Accounts are throwaway (`e2e-<time>-<random>@example.com`)
// and stay in the local database: the API has no way to delete them.

export interface Account {
  email: string
  password: string
}

/** Retries a call answered 429 after its Retry-After, so a run close to the API's rate limits still passes. */
async function withRateLimitRetry<T extends { status(): number; headers(): Record<string, string> }>(
  call: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await call()
    if (response.status() !== 429 || attempt === 3) return response
    const seconds = Number(response.headers()['retry-after'] ?? '5')
    await new Promise((resolve) => setTimeout(resolve, (Number.isFinite(seconds) ? seconds : 5) * 1000 + 250))
  }
}

/** Registers a new account through the front's /v1 proxy. */
export async function newAccount(request: APIRequestContext): Promise<Account> {
  const account = {
    email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    password: 'e2e-auth-password',
  }
  const response = await withRateLimitRetry(() => request.post('/v1/auth/register', { data: account }))
  expect(response.status(), await response.text()).toBe(201)
  return account
}

/** The header's account button of a signed-in user. */
export function accountButton(page: Page, account: Account) {
  return page.getByRole('button', { name: `Account: ${account.email}` })
}

/** Signs in with the form and waits until the header shows the account. */
export async function signInThroughUi(page: Page, account: Account, path = '/login'): Promise<void> {
  await page.goto(path)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(accountButton(page, account)).toBeVisible()
}

/** Records the context's calls to /v1/auth/* as "METHOD /path STATUS", in the order the answers arrive. */
export function trackAuthCalls(context: BrowserContext): string[] {
  const calls: string[] = []
  context.on('requestfinished', async (request) => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/v1/auth/')) return
    const response = await request.response()
    calls.push(`${request.method()} ${url.pathname} ${response?.status() ?? '-'}`)
  })
  context.on('requestfailed', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/v1/auth/')) calls.push(`${request.method()} ${url.pathname} failed`)
  })
  return calls
}

export async function cookieNamed(context: BrowserContext, name: string) {
  return (await context.cookies()).find((cookie) => cookie.name === name)
}

/** Console errors and uncaught exceptions: CSP violations and hydration mismatches do not fail a render by themselves. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}
