import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '@/lib/auth/session'
import { ANN, BOB } from '@/test/auth'
import { AuthGuard } from '@/components/auth/auth-guard'
import { RedirectIfAuthenticated } from '@/components/auth/redirect-if-authenticated'

const auth = vi.hoisted(() => ({ snapshot: { status: 'loading', user: null } as SessionSnapshot }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => auth.snapshot }))

const session = vi.hoisted(() => ({ retrySession: vi.fn() }))
vi.mock('@/lib/auth/session', () => session)

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

beforeEach(() => {
  replace.mockReset()
  session.retrySession.mockReset()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

function Private() {
  return <p>Private page</p>
}

describe('AuthGuard', () => {
  it('shows the fallback while the session is checked', () => {
    auth.snapshot = { status: 'loading', user: null }
    render(<AuthGuard fallback={<p>Skeleton</p>}>{<Private />}</AuthGuard>)

    expect(screen.getByText('Skeleton')).toBeInTheDocument()
    expect(screen.queryByText('Private page')).not.toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('sends a guest to sign in, coming back here', () => {
    window.history.replaceState(null, '', '/account?tab=sessions')
    auth.snapshot = { status: 'unauthenticated', user: null }
    render(<AuthGuard fallback={<p>Skeleton</p>}>{<Private />}</AuthGuard>)

    expect(screen.queryByText('Private page')).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/login?next=%2Faccount%3Ftab%3Dsessions')
  })

  it('offers a retry when the session could not be checked', async () => {
    auth.snapshot = { status: 'error', user: null }
    render(<AuthGuard fallback={<p>Skeleton</p>}>{<Private />}</AuthGuard>)

    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't check your sign-in.")
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(session.retrySession).toHaveBeenCalledWith({ visibly: true })
    expect(replace).not.toHaveBeenCalled()
  })

  it('renders the page for a signed-in user, and starts it over for another account', () => {
    let instances = 0
    function Instance() {
      const [id] = useState(() => ++instances)
      return <p>Private page {id}</p>
    }
    auth.snapshot = { status: 'authenticated', user: ANN }
    const { rerender } = render(
      <AuthGuard fallback={<p>Skeleton</p>}>
        <Instance />
      </AuthGuard>,
    )
    expect(screen.getByText('Private page 1')).toBeInTheDocument()

    auth.snapshot = { status: 'authenticated', user: { ...ANN } }
    rerender(
      <AuthGuard fallback={<p>Skeleton</p>}>
        <Instance />
      </AuthGuard>,
    )
    expect(screen.getByText('Private page 1')).toBeInTheDocument()

    auth.snapshot = { status: 'authenticated', user: BOB }
    rerender(
      <AuthGuard fallback={<p>Skeleton</p>}>
        <Instance />
      </AuthGuard>,
    )
    expect(screen.getByText('Private page 2')).toBeInTheDocument()
  })
})

describe('RedirectIfAuthenticated', () => {
  it('shows the form to guests and while the session is checked', () => {
    auth.snapshot = { status: 'loading', user: null }
    render(<RedirectIfAuthenticated fallback={<p>Skeleton</p>}>{<p>Form</p>}</RedirectIfAuthenticated>)

    expect(screen.getByText('Form')).toBeInTheDocument()
    expect(replace).not.toHaveBeenCalled()
  })

  it('moves a signed-in user on to a safe ?next=', () => {
    window.history.replaceState(null, '', '/login?next=%2Fshowtimes%2F7')
    auth.snapshot = { status: 'authenticated', user: ANN }
    render(<RedirectIfAuthenticated fallback={<p>Skeleton</p>}>{<p>Form</p>}</RedirectIfAuthenticated>)

    expect(screen.getByText('Skeleton')).toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith('/showtimes/7')
  })

  it('goes home instead of to another site', () => {
    window.history.replaceState(null, '', '/login?next=%2F%2Fevil.example')
    auth.snapshot = { status: 'authenticated', user: ANN }
    render(<RedirectIfAuthenticated fallback={<p>Skeleton</p>}>{<p>Form</p>}</RedirectIfAuthenticated>)

    expect(replace).toHaveBeenCalledWith('/')
  })
})
