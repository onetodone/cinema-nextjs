import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { LoginForm } from './login-form'

const session = vi.hoisted(() => ({ signIn: vi.fn() }))
vi.mock('@/lib/auth/session', () => session)

const search = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search.value) }))

beforeEach(() => {
  session.signIn.mockReset()
  search.value = ''
})

async function submit(email: string, password: string) {
  const user = userEvent.setup()
  if (email) await user.type(screen.getByLabelText('Email'), email)
  if (password) await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginForm', () => {
  it('checks the fields first and focuses the first one to fix', async () => {
    render(<LoginForm />)

    await submit('', '')

    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(session.signIn).not.toHaveBeenCalled()
  })

  it('signs in with the typed credentials', async () => {
    session.signIn.mockResolvedValue(undefined)
    render(<LoginForm />)

    await submit('  ann@example.com ', 'secret-password')

    expect(session.signIn).toHaveBeenCalledWith('ann@example.com', 'secret-password')
  })

  it('says when the credentials are wrong, keeping what was typed', async () => {
    session.signIn.mockRejectedValue(new ApiError('bad', { status: 401, code: 'INVALID_CREDENTIALS' }))
    render(<LoginForm />)

    await submit('ann@example.com', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.')
    expect(screen.getByLabelText('Email')).toHaveValue('ann@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-password')
  })

  it('says how long to wait when rate-limited', async () => {
    session.signIn.mockRejectedValue(new ApiError('slow down', { status: 429, code: 'RATE_LIMITED', retryAfter: 30 }))
    render(<LoginForm />)

    await submit('ann@example.com', 'secret-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please try again in 30 seconds.')
  })

  it('keeps ?next= on the way to registration', async () => {
    search.value = 'next=/showtimes/7'
    render(<LoginForm />)

    expect(await screen.findByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/register?next=%2Fshowtimes%2F7',
    )
  })
})
