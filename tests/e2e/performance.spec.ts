import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { newAccount, signInThroughUi } from './support/auth'
import { apiToken, bookableShowtime, freeSeats, holdThroughApi, type Seat } from './support/booking'

// Layout stability and the seat map at the API's largest hall. The numbers are reported as annotations of each test
// (`--reporter=list` prints them); the budgets are Core Web Vitals' "good" thresholds, far above what the pages need.

/** Cumulative Layout Shift budget ("good" is at most 0.1). */
const CLS_BUDGET = 0.1
/** Interaction to Next Paint budget ("good" is at most 200 ms). */
const INP_BUDGET_MS = 200

declare global {
  interface Window {
    __layoutShift: number
    /** What moved, for the failure message: "value: element (y before → after)". */
    __shiftSources: string[]
  }
}

/** What the large-hall spec records in the page. */
interface Probe {
  __events: number[]
  __hallArrived?: number
  __hallShown?: number
}

/** Sums the layout shifts not caused by input, from the start of every page the context opens. */
async function recordLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    window.__layoutShift = 0
    window.__shiftSources = []
    type Shift = PerformanceEntry & {
      value: number
      hadRecentInput: boolean
      sources: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[]
    }
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Shift[]) {
        if (entry.hadRecentInput) continue
        window.__layoutShift += entry.value
        const moved = entry.sources.map(({ node, previousRect, currentRect }) => {
          const name = node instanceof Element ? `${node.localName}.${node.className}`.slice(0, 60) : String(node)
          return `${name} (y ${previousRect.y} → ${currentRect.y})`
        })
        window.__shiftSources.push(`${entry.value.toFixed(3)}: ${moved.join(', ')}`)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
}

/**
 * Loads `path` fresh, lets it settle (data streamed in, session checked, holds fetched), and returns its shift and
 * what moved.
 */
async function layoutShiftOf(page: Page, path: string): Promise<{ shift: number; sources: string[] }> {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  // Late arrivals (the hold strip after the session check) come within a second of network idle.
  await page.waitForTimeout(1_000)
  return page.evaluate(() => ({ shift: window.__layoutShift, sources: window.__shiftSources }))
}

function report(label: string, value: string) {
  test.info().annotations.push({ type: label, description: value })
}

test.describe('performance', () => {
  test('public pages do not shift while they load, on a desktop and on a phone', async ({ page, request }) => {
    const showtime = await bookableShowtime(request)
    const paths = ['/', '/movies', `/movies/${showtime.movie.id}`, '/schedule', `/showtimes/${showtime.id}`, '/login']
    await recordLayoutShifts(page)

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      for (const path of paths) {
        const { shift, sources } = await layoutShiftOf(page, path)
        report(`CLS ${viewport.width}px ${path}`, shift.toFixed(3))
        expect(shift, `${path} at ${viewport.width}px: ${sources.join('; ')}`).toBeLessThanOrEqual(CLS_BUDGET)
      }
    }
  })

  test('signed-in pages do not shift while the session and the data load, with a hold on a phone', async ({
    page,
    request,
  }) => {
    const account = await newAccount(request)
    const showtime = await bookableShowtime(request)
    const [seat] = await freeSeats(request, showtime.id, 1)
    const hold = await holdThroughApi(request, await apiToken(request, account), showtime.id, [seat])
    await recordLayoutShifts(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await signInThroughUi(page, account)

    // The strip under the header ("Seats held · 12:34") appears once the session is known: the one shift left.
    for (const path of ['/movies', '/bookings', '/account', `/checkout/${hold.id}`, `/showtimes/${showtime.id}`]) {
      const { shift, sources } = await layoutShiftOf(page, path)
      report(`CLS 390px signed in, with a hold ${path}`, shift.toFixed(3))
      expect(shift, `${path}: ${sources.join('; ')}`).toBeLessThanOrEqual(CLS_BUDGET)
    }
  })

  test('a 1 000-seat hall on a slow CPU: picking and moving between seats stays responsive', async ({
    page,
    request,
  }) => {
    const showtime = await bookableShowtime(request)
    const hall = largeHall(showtime.id)
    let changed: Record<number, Partial<Seat>> = {}
    // The server renders the real map; the browser's polls get the large hall from here.
    await page.route(`**/v1/showtimes/${showtime.id}/seats`, (route) =>
      route.fulfill({ json: withChanges(hall, changed) }),
    )
    await page.addInitScript(() => {
      const w = window as unknown as Probe
      w.__events = []
      // Interactions slower than 16 ms (the Event Timing API's floor), as INP counts them.
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
          if (entry.interactionId) w.__events.push(entry.duration)
        }
      }).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
      // When the first answer with 1 000 seats arrives, and when they are all on screen.
      const fetch = window.fetch
      window.fetch = async (...args: Parameters<typeof fetch>) => {
        const response = await fetch(...args)
        const url = args[0] instanceof Request ? args[0].url : String(args[0])
        if (url.includes('/seats') && w.__hallArrived === undefined) w.__hallArrived = performance.now()
        return response
      }
      new MutationObserver((_, observer) => {
        if (document.querySelectorAll('[data-seat-id]').length < 1_000) return
        w.__hallShown = performance.now()
        observer.disconnect()
      }).observe(document, { childList: true, subtree: true })
    })

    // A mid-range phone's CPU: four times slower than this machine's.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

    await page.goto(`/showtimes/${showtime.id}`)
    const seats = page.getByRole('group', { name: 'Seats' }).getByRole('button')
    // The first poll (5 s after the page loads) swaps the real map for the large hall.
    await expect(seats).toHaveCount(1_000, { timeout: 15_000 })
    const swap = await page.evaluate(() => {
      const w = window as unknown as Probe
      return w.__hallShown! - w.__hallArrived!
    })
    report('1000 seats: from the answer to every seat on screen (ms)', swap.toFixed(0))

    // Picks with the mouse, then moves and picks with the keyboard.
    for (const number of [10, 12, 14]) {
      const seat = page.getByRole('button', { name: new RegExp(`^Row M, seat ${number},`) })
      await seat.click()
      await expect(seat).toHaveAttribute('aria-pressed', 'true')
    }
    // From M14: ten to the right, one down, to N24.
    for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    const reached = page.getByRole('button', { name: /^Row N, seat 24,/ })
    await expect(reached).toBeFocused()
    await expect(reached).toHaveAttribute('aria-pressed', 'true')

    // A poll that changes a few seats (one of them picked) updates them in place.
    changed = { [seatId('M', 10)]: { status: 'held' }, [seatId('A', 1)]: { status: 'sold' } }
    const taken = page.getByRole('button', { name: /^Row M, seat 10,/ })
    await expect(taken).toHaveAccessibleName(/on hold$/, { timeout: 10_000 })

    const events = await page.evaluate(() => (window as unknown as Probe).__events)
    const slowest = Math.max(0, ...events)
    report('1000 seats: slowest interaction (ms, events under 16 ms are not reported)', slowest.toFixed(0))
    // React's development build (under `pnpm dev`) is several times slower: the budget holds for production builds.
    const development = await page.evaluate(() =>
      Array.from(document.scripts).some((script) => script.src.includes('hmr-client')),
    )
    if (development) report('note', 'development build: the interaction budget is not enforced')
    else expect(slowest).toBeLessThanOrEqual(INP_BUDGET_MS)
  })
})

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY' // 25 rows of 40 seats: the API's limit of 1 000 seats a hall
const SEATS_PER_ROW = 40

/** Seat ids of the large hall, far above the demo seed's. */
function seatId(row: string, number: number): number {
  return 9_000_000 + ROWS.indexOf(row) * SEATS_PER_ROW + number
}

/** The API's seat map of a 1 000-seat hall: accessible front row, VIP back rows, a third of the seats taken. */
function largeHall(showtimeId: number) {
  const seats: (Seat & { type: string; price_cents: number })[] = []
  for (const [rowIndex, row] of [...ROWS].entries()) {
    for (let number = 1; number <= SEATS_PER_ROW; number++) {
      const type = rowIndex === 0 ? 'accessible' : rowIndex >= 22 ? 'vip' : 'standard'
      const taken = (rowIndex * 7 + number * 3) % 9 < 3
      seats.push({
        id: seatId(row, number),
        row,
        number,
        type,
        price_cents: type === 'vip' ? 1650 : 1100,
        status: taken ? (number % 2 === 0 ? 'sold' : 'held') : 'available',
      })
    }
  }
  // The seats the spec picks are free.
  for (const [row, number] of [
    ['M', 10],
    ['M', 12],
    ['M', 14],
    ['N', 24],
  ] as const) {
    seats.find((seat) => seat.id === seatId(row, number))!.status = 'available'
  }
  return {
    showtime_id: showtimeId,
    movie: { id: 1, title: 'A large hall', duration_min: 120 },
    hall: { id: 9, name: 'Hall 9' },
    starts_at: '2999-01-01T19:30:00Z',
    currency: 'USD',
    seats,
  }
}

/** The hall with some seats changed, and its summary counted. */
function withChanges(hall: ReturnType<typeof largeHall>, changes: Record<number, Partial<Seat>>) {
  const seats = hall.seats.map((seat) => ({ ...seat, ...changes[seat.id] }))
  const count = (status: string) => seats.filter((seat) => seat.status === status).length
  return {
    ...hall,
    seats,
    summary: { available: count('available'), held: count('held'), sold: count('sold'), total: seats.length },
  }
}
