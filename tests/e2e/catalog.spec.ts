import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// Runs against the real local API and its seeded catalog (see README → Testing). Showtimes are read from the API, so
// the specs do not depend on seed ids or on the time of day: they use tomorrow's first showtime, which is bookable.

interface Showtime {
  id: number
  movie: { id: number; title: string }
}

interface Seat {
  id: number
  row: string
  number: number
  status: string
}

async function tomorrowsShowtimes(request: APIRequestContext): Promise<{ date: string; items: Showtime[] }> {
  const today = (await (await request.get('/v1/showtimes')).json()) as { date: string }
  const date = new Date(`${today.date}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  const tomorrow = date.toISOString().slice(0, 10)
  const schedule = (await (await request.get(`/v1/showtimes?date=${tomorrow}`)).json()) as { items: Showtime[] }
  expect(schedule.items.length, 'the seeded schedule has showtimes tomorrow').toBeGreaterThan(0)
  return { date: tomorrow, items: schedule.items }
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('catalog', () => {
  test('home → movie → showtime renders server-side and hydrates cleanly', async ({ page, request }) => {
    const errors = collectConsoleErrors(page)
    const { items } = await tomorrowsShowtimes(request)
    const { movie } = items[0]

    await page.goto('/')
    await page.getByRole('region', { name: 'Now showing' }).getByRole('link', { name: movie.title }).click()

    await expect(page).toHaveURL(`/movies/${movie.id}`)
    await expect(page.getByRole('heading', { level: 1, name: movie.title })).toBeVisible()
    await expect(page).toHaveTitle(`${movie.title} · Cinema`)
    await page
      .getByRole('link', { name: /^\d{1,2}:\d{2} [AP]M/ })
      .first()
      .click()

    await expect(page).toHaveURL(/\/showtimes\/\d+$/)
    await expect(page.getByRole('group', { name: 'Seats' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })

  test('the HTML response carries the catalog (server-rendered, not fetched by the browser)', async ({ request }) => {
    const { items } = await tomorrowsShowtimes(request)
    const { id, movie } = items[0]

    const moviePage = await (await request.get(`/movies/${movie.id}`)).text()
    expect(moviePage).toContain(`<title>${movie.title} · Cinema</title>`)
    expect(moviePage).toContain(`href="/showtimes/${id}"`)

    const showtimePage = await (await request.get(`/showtimes/${id}`)).text()
    expect(showtimePage).toMatch(/aria-label="Row [A-Z]+, seat \d+, [^"]*available"/)
  })

  test('the schedule switches days and filters by movie', async ({ page, request }) => {
    const { date, items } = await tomorrowsShowtimes(request)
    const { movie } = items[0]

    await page.goto('/schedule')
    await page.getByRole('navigation', { name: 'Days' }).getByRole('link').nth(1).click()
    await expect(page).toHaveURL(`/schedule?date=${date}`)
    await expect(page.getByRole('navigation', { name: 'Days' }).locator('[aria-current="date"]')).toHaveCount(1)

    await page.getByRole('navigation', { name: 'Filter by movie' }).getByRole('link', { name: movie.title }).click()
    await expect(page).toHaveURL(`/schedule?date=${date}&movie=${movie.id}`)
    const list = page.getByRole('region', { name: /\w+day, \w+ \d+/ })
    await expect(list.getByRole('heading', { level: 3 })).toHaveText([movie.title])
  })

  test('seats are picked with the mouse and the keyboard', async ({ page, request }) => {
    const { items } = await tomorrowsShowtimes(request)
    await page.goto(`/showtimes/${items[0].id}`)

    // Pin the seat by id: its accessible name changes once it is picked.
    const seatId = await page
      .getByRole('group', { name: 'Seats' })
      .getByRole('button', { name: /available$/ })
      .first()
      .getAttribute('data-seat-id')
    const first = page.locator(`[data-seat-id="${seatId}"]`)
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/^1 seat · \$\d+\.\d{2}$/)).toBeVisible()

    await page.keyboard.press('ArrowRight')
    const focused = page.locator('[data-seat-id]:focus')
    await expect(focused).toHaveAttribute('tabindex', '0')
    await page.keyboard.press('Space')
    await expect(focused).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText(/^2 seats · /)).toBeVisible()
  })

  test('a seat held elsewhere shows up on an open map within a poll', async ({ page, request }) => {
    const { items } = await tomorrowsShowtimes(request)
    const showtimeId = items[0].id
    const map = (await (await request.get(`/v1/showtimes/${showtimeId}/seats`)).json()) as { seats: Seat[] }
    const seat = map.seats.findLast((candidate) => candidate.status === 'available')!

    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const password = 'e2e-catalog-password'
    expect((await request.post('/v1/auth/register', { data: { email, password } })).status()).toBe(201)
    const login = await request.post('/v1/auth/login', { data: { email, password } })
    const { access_token: token } = (await login.json()) as { access_token: string }
    const auth = { Authorization: `Bearer ${token}` }

    await page.goto(`/showtimes/${showtimeId}`)
    const button = page.getByRole('button', { name: new RegExp(`^Row ${seat.row}, seat ${seat.number},`) })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    const hold = await request.post('/v1/bookings', {
      headers: auth,
      data: { showtime_id: showtimeId, seat_ids: [seat.id] },
    })
    expect(hold.status()).toBe(201)
    const { id: bookingId } = (await hold.json()) as { id: string }
    try {
      // The map polls every 5 s; the picked seat leaves the selection with a notice.
      await expect(button).toHaveAccessibleName(/on hold$/, { timeout: 8_000 })
      await expect(button).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByText(`Seat ${seat.row}${seat.number} was just taken`)).toBeVisible()
    } finally {
      await request.delete(`/v1/bookings/${bookingId}`, { headers: auth })
    }
  })

  test('unknown ids get not-found pages that stay out of search results', async ({ page }) => {
    await page.goto('/movies/999999999')
    await expect(page.getByRole('heading', { name: 'Movie not found' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/)

    await page.goto('/showtimes/not-a-number')
    await expect(page.getByRole('heading', { name: 'Showtime not found' })).toBeVisible()
  })

  test('robots.txt and the sitemap list the public pages', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text()
    expect(robots).toContain('Disallow: /v1/')
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/)

    const sitemap = await (await request.get('/sitemap.xml')).text()
    expect(sitemap).toContain('/schedule</loc>')
    expect(sitemap).toMatch(/\/movies\/\d+<\/loc>/)
  })

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`catalog pages have no detectable a11y violations (${colorScheme})`, async ({ page, request }) => {
      const { items } = await tomorrowsShowtimes(request)
      await page.emulateMedia({ colorScheme })

      for (const path of ['/movies', `/movies/${items[0].movie.id}`, '/schedule', `/showtimes/${items[0].id}`]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.waitForLoadState('networkidle')
        const results = await new AxeBuilder({ page }).analyze()
        expect(results.violations, path).toEqual([])
      }
    })
  }
})
