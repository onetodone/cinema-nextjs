import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '@/lib/auth/session'
import { ANN } from '@/test/auth'
import { UserMenu } from '@/components/layout/user-menu'

const auth = vi.hoisted(() => ({ snapshot: { status: 'loading', user: null } as SessionSnapshot }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth.snapshot }))

const session = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/lib/auth/session', () => session)

const location = vi.hoisted(() => ({ pathname: '/', search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => location.pathname,
  useSearchParams: () => new URLSearchParams(location.search),
}))

const toast = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

beforeEach(() => {
  session.signOut.mockReset().mockResolvedValue(undefined)
  toast.success.mockReset()
  location.pathname = '/'
  location.search = ''
})

describe('UserMenu', () => {
  it('holds the place while the session is checked', () => {
    auth.snapshot = { status: 'loading', user: null }
    const { container } = render(<UserMenu />)

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers a guest to sign in, coming back to this page', () => {
    auth.snapshot = { status: 'unauthenticated', user: null }
    location.pathname = '/schedule'
    location.search = 'date=2026-09-28'
    render(<UserMenu />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fschedule%3Fdate%3D2026-09-28',
    )
  })

  it('keeps the next of the auth page it is on', () => {
    auth.snapshot = { status: 'unauthenticated', user: null }
    location.pathname = '/register'
    location.search = 'next=/showtimes/7'
    render(<UserMenu />)

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Fshowtimes%2F7')
  })

  it('shows the account menu to a signed-in user, and signs out from it', async () => {
    auth.snapshot = { status: 'authenticated', user: ANN }
    const user = userEvent.setup()
    render(<UserMenu />)

    await user.click(screen.getByRole('button', { name: `Account: ${ANN.email}` }))
    expect(await screen.findByText(ANN.email)).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account')

    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(session.signOut).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('You have signed out.', { id: 'signed-out' })
  })
})
