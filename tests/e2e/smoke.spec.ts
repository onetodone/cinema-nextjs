import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './support/test'

test.describe('smoke', () => {
  test('the home page renders with the security headers', async ({ page }) => {
    // Console errors catch CSP violations and hydration mismatches, which do not fail a render on their own.
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    const response = await page.goto('/')

    expect(response?.status()).toBe(200)
    const headers = response!.headers()
    expect(headers['content-security-policy']).toContain("connect-src 'self'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-powered-by']).toBeUndefined()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })

  test('the theme toggle switches between dark and light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveClass(/\bdark\b/)

    await page.getByRole('button', { name: 'Toggle theme' }).click()
    await expect(html).toHaveClass(/\blight\b/)

    await page.reload()
    await expect(html).toHaveClass(/\blight\b/)
  })

  test('the /v1 proxy reaches the API', async ({ request }) => {
    const movies = await request.get('/v1/movies')
    expect(movies.status()).toBe(200)
    expect(await movies.json()).toHaveProperty('items')

    const me = await request.get('/v1/me')
    expect(me.status()).toBe(401)
    expect(me.headers()['content-type']).toContain('application/problem+json')
    expect(await me.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`the home page has no detectable a11y violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }
})
