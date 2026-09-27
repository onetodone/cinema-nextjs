import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { runFormAction, toFormState } from '@/lib/forms'
import { registerSchema } from '@/schemas/auth'

function formData(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

describe('toFormState', () => {
  it('turns the API field errors into sentences keyed by field', () => {
    const error = new ApiError('invalid', {
      status: 400,
      code: 'VALIDATION_FAILED',
      fieldErrors: [
        { field: 'password', message: 'must be at least 8 characters' },
        { field: 'password', message: 'is ignored as a second message' },
        { field: 'email', message: 'must be a valid email address' },
      ],
    })

    expect(toFormState(error)).toEqual({
      error: 'Please check the highlighted fields.',
      fieldErrors: {
        password: 'Password must be at least 8 characters.',
        email: 'Email must be a valid email address.',
      },
    })
  })

  it('adds the request id to server faults', () => {
    const error = new ApiError('boom', { status: 500, code: 'INTERNAL', requestId: 'req-7' })
    expect(toFormState(error)).toEqual({
      error: 'Something went wrong on our side. Please try again. (Reference: req-7)',
    })
  })
})

describe('runFormAction', () => {
  const action = runFormAction(registerSchema, async () => ({ success: true }))

  it('checks the form before calling the handler', async () => {
    await expect(action(undefined, formData({ email: 'nope', password: 'short' }))).resolves.toEqual({
      error: 'Enter a valid email address, like ann@example.com.',
      fieldErrors: {
        email: 'Enter a valid email address, like ann@example.com.',
        password: 'Password must be at least 8 characters.',
      },
    })
  })

  it('counts password length in characters and bytes, as the API does', async () => {
    // 8 emoji: 8 characters (16 UTF-16 units), 32 bytes.
    await expect(action(undefined, formData({ email: 'ann@example.com', password: '🎬'.repeat(8) }))).resolves.toEqual({
      success: true,
    })
    // 19 emoji: 76 bytes, over bcrypt's 72.
    const tooLong = await action(undefined, formData({ email: 'ann@example.com', password: '🎬'.repeat(19) }))
    expect(tooLong?.fieldErrors?.password).toMatch(/too long/)
  })

  it('returns thrown errors as form state', async () => {
    const failing = runFormAction(registerSchema, async () => {
      throw new ApiError('taken', { status: 409, code: 'EMAIL_TAKEN' })
    })
    await expect(
      failing(undefined, formData({ email: ' ann@example.com ', password: 'long enough' })),
    ).resolves.toEqual({
      error: 'An account with this email already exists. Sign in instead.',
    })
  })
})
