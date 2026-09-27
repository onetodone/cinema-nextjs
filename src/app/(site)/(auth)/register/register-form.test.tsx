import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { RegisterForm } from './register-form'

const session = vi.hoisted(() => ({ registerAccount: vi.fn(), signIn: vi.fn() }))
vi.mock('@/lib/auth/session', () => session)
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))

beforeEach(() => {
  session.registerAccount.mockReset().mockResolvedValue(undefined)
  session.signIn.mockReset().mockResolvedValue(undefined)
})

async function submit(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('RegisterForm', () => {
  it('creates the account, then signs in with the same credentials', async () => {
    render(<RegisterForm />)

    await submit('ann@example.com', 'secret-password')

    await vi.waitFor(() => expect(session.signIn).toHaveBeenCalledWith('ann@example.com', 'secret-password'))
    expect(session.registerAccount).toHaveBeenCalledWith('ann@example.com', 'secret-password')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('checks the password length before sending', async () => {
    render(<RegisterForm />)

    await submit('ann@example.com', 'short')

    expect(await screen.findByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveFocus()
    expect(session.registerAccount).not.toHaveBeenCalled()
  })

  it('marks the email when it is taken', async () => {
    session.registerAccount.mockRejectedValue(new ApiError('taken', { status: 409, code: 'EMAIL_TAKEN' }))
    render(<RegisterForm />)

    await submit('ann@example.com', 'secret-password')

    expect(await screen.findByText('An account with this email already exists. Sign in instead.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(session.signIn).not.toHaveBeenCalled()
  })

  it('shows the API’s field errors', async () => {
    session.registerAccount.mockRejectedValue(
      new ApiError('invalid', {
        status: 400,
        code: 'VALIDATION_FAILED',
        fieldErrors: [{ field: 'email', message: 'must be a valid email address' }],
      }),
    )
    render(<RegisterForm />)

    await submit('ann@example.com', 'secret-password')

    expect(await screen.findByText('Email must be a valid email address.')).toBeInTheDocument()
  })

  it('says the account exists when only the sign-in failed', async () => {
    session.signIn.mockRejectedValue(new ApiError('slow down', { status: 429, code: 'RATE_LIMITED', retryAfter: 20 }))
    render(<RegisterForm />)

    await submit('ann@example.com', 'secret-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your account was created, but signing in failed: Too many attempts. Please try again in 20 seconds. Please sign in.',
    )
  })
})
