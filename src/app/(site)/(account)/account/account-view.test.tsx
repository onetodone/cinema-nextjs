import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthSession } from '@/lib/api/types'
import type { SessionSnapshot } from '@/lib/auth/session'
import { ANN } from '@/test/auth'
import { problemResponse } from '@/test/booking'
import { renderWithQueryClient } from '@/test/query'
import { AccountView } from './account-view'

const auth = vi.hoisted(() => ({ snapshot: { status: 'authenticated', user: null } as SessionSnapshot }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth.snapshot }))

const session = vi.hoisted(() => ({
  getValidAccessToken: async () => 'access-token',
  refreshAccessToken: async () => 'access-token-2',
  expireSession: () => {},
  signOut: vi.fn(),
  signOutEverywhere: vi.fn(),
}))
vi.mock('@/lib/auth/session', () => session)

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Half a minute more than the label says: the page's clock ticks every 15 s, so it may be a little behind.
const minutesAgo = (minutes: number) => new Date(Date.now() - (minutes + 0.5) * 60_000).toISOString()

const THIS_ONE: AuthSession = {
  id: '0199a1f0-0000-7000-8000-00000000000a',
  current: true,
  created_at: '2026-09-20T08:00:00Z',
  last_used_at: minutesAgo(12),
  expires_at: '2999-01-01T00:00:00Z',
  user_agent: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  ip: '198.51.100.7',
}
const PHONE: AuthSession = {
  id: '0199a1f0-0000-7000-8000-00000000000b',
  current: false,
  created_at: '2026-09-21T08:00:00Z',
  last_used_at: minutesAgo(5),
  expires_at: '2999-01-01T00:00:00Z',
  user_agent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  ip: '203.0.113.20',
}
const SCRIPT: AuthSession = {
  id: '0199a1f0-0000-7000-8000-00000000000c',
  current: false,
  created_at: '2026-09-22T08:00:00Z',
  last_used_at: minutesAgo(3 * 24 * 60),
  expires_at: '2999-01-01T00:00:00Z',
  user_agent: '',
}

let sessionReads: number
let revoked: string[]

/** `GET /v1/auth/sessions` answers `lists` in turn (the last one repeats); DELETE answers `revoke`. */
function api({
  lists = [[PHONE, THIS_ONE, SCRIPT]],
  revoke = () => new HttpResponse(null, { status: 204 }),
}: {
  lists?: (AuthSession[] | Response)[]
  revoke?: () => Response
}) {
  server.use(
    http.get('*/v1/me', () => HttpResponse.json(ANN)),
    http.get('*/v1/auth/sessions', () => {
      sessionReads++
      const answer = lists[Math.min(sessionReads, lists.length) - 1]
      return answer instanceof Response ? answer : HttpResponse.json({ items: answer })
    }),
    http.delete('*/v1/auth/sessions/:id', ({ params }) => {
      revoked.push(String(params.id))
      return revoke()
    }),
  )
}

beforeEach(() => {
  auth.snapshot = { status: 'authenticated', user: ANN }
  sessionReads = 0
  revoked = []
  toast.success.mockReset()
  toast.error.mockReset()
})

function sessionsCard() {
  return screen.getByRole('heading', { name: "Where you're signed in" }).closest('[data-slot="card"]') as HTMLElement
}

describe('AccountView sessions', () => {
  it('lists where the account is signed in: this device first, the others with a readable name and when last used', async () => {
    api({})
    renderWithQueryClient(<AccountView />)

    const rows = await within(await findSessionsList()).findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Firefox on LinuxThis deviceActive now · signed in September 20, 2026 · 198.51.100.7',
      'Safari on iPhoneLast active 5 minutes ago · signed in September 21, 2026 · 203.0.113.20Sign out',
      'Unknown deviceLast active 3 days ago · signed in September 22, 2026Sign out',
    ])
    // This browser signs out with "Sign out" below the list, not from its row.
    expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument()
    const phoneButton = within(rows[1]).getByRole('button', { name: 'Sign out Safari on iPhone' })
    expect(phoneButton).toHaveAccessibleDescription(
      'Last active 5 minutes ago · signed in September 21, 2026 · 203.0.113.20',
    )
    expect(within(sessionsCard()).getByRole('button', { name: 'Sign out everywhere' })).toBeInTheDocument()
  })

  it('signs another device out after a confirmation, and continues from the heading', async () => {
    api({ lists: [[PHONE, THIS_ONE], [THIS_ONE]] })
    const user = userEvent.setup()
    renderWithQueryClient(<AccountView />)

    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Sign out Safari on iPhone?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument())
    expect(revoked).toEqual([PHONE.id])
    expect(toast.success).toHaveBeenCalledWith('Safari on iPhone was signed out.', { id: `revoked-${PHONE.id}` })
    expect(screen.getByRole('heading', { name: "Where you're signed in" })).toHaveFocus()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(sessionReads).toBe(2))
    expect(session.signOut).not.toHaveBeenCalled()
  })

  it('treats a session that has already ended as signed out', async () => {
    api({ lists: [[PHONE, THIS_ONE], [THIS_ONE]], revoke: () => problemResponse(404, 'SESSION_NOT_FOUND') })
    const user = userEvent.setup()
    renderWithQueryClient(<AccountView />)

    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('keeps the device listed and says why when signing it out fails', async () => {
    api({ lists: [[PHONE, THIS_ONE]], revoke: () => problemResponse(500, 'INTERNAL') })
    const user = userEvent.setup()
    renderWithQueryClient(<AccountView />)

    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sign out' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Couldn’t sign out Safari on iPhone. Something went wrong on our side. Please try again.',
        { id: `revoke-failed-${PHONE.id}` },
      ),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Safari on iPhone')).toBeInTheDocument()
  })

  it('offers to try again when the sessions cannot be loaded', async () => {
    api({ lists: [problemResponse(500, 'INTERNAL'), [THIS_ONE]] })
    const user = userEvent.setup()
    renderWithQueryClient(<AccountView />)

    const alert = await within(sessionsCard()).findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load where you're signed in.")
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Firefox on Linux')).toBeInTheDocument()
  })

  it('signs this browser out from the card', async () => {
    api({})
    const user = userEvent.setup()
    renderWithQueryClient(<AccountView />)

    await user.click(await within(sessionsCard()).findByRole('button', { name: 'Sign out' }))
    expect(session.signOut).toHaveBeenCalledTimes(1)
  })
})

async function findSessionsList() {
  await screen.findByText('Firefox on Linux')
  return within(sessionsCard()).getByRole('list')
}
