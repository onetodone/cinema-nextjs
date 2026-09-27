import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { errorMessage, errorReference, isSignedOutError } from '@/lib/api/messages'

const apiError = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[1]> = {}) =>
  new ApiError(code, { status, code, ...extra })

describe('errorMessage', () => {
  it('speaks for known codes, not with the API detail', () => {
    expect(errorMessage(apiError(401, 'INVALID_CREDENTIALS', { detail: 'the email or password is incorrect' }))).toBe(
      'The email or password is incorrect.',
    )
    expect(errorMessage(apiError(0, 'NETWORK'))).toMatch(/Can’t reach/)
    expect(errorMessage(apiError(401, 'REFRESH_INVALID'))).toBe('Your session has ended. Please sign in again.')
  })

  it('says how long to wait after a rate limit', () => {
    expect(errorMessage(apiError(429, 'RATE_LIMITED', { retryAfter: 42 }))).toBe(
      'Too many attempts. Please try again in 42 seconds.',
    )
    expect(errorMessage(apiError(429, 'RATE_LIMITED', { retryAfter: 90 }))).toBe(
      'Too many attempts. Please try again in 2 minutes.',
    )
    expect(errorMessage(apiError(429, 'RATE_LIMITED'))).toBe('Too many attempts. Please try again in a minute.')
  })

  it('falls back to the detail for unknown codes, and to a generic message', () => {
    expect(errorMessage(apiError(409, 'SOMETHING_NEW', { detail: 'A new conflict.' }))).toBe('A new conflict.')
    expect(errorMessage(apiError(502, 'UNEXPECTED_BACKEND'))).toBe(
      'Something went wrong on our side. Please try again.',
    )
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.')
  })
})

describe('errorReference', () => {
  it('gives the request id of server faults only', () => {
    expect(errorReference(apiError(500, 'INTERNAL', { requestId: 'req-9' }))).toBe('req-9')
    expect(errorReference(apiError(409, 'EMAIL_TAKEN', { requestId: 'req-9' }))).toBeNull()
    expect(errorReference(new Error('boom'))).toBeNull()
  })
})

describe('isSignedOutError', () => {
  it('is true for 401s', () => {
    expect(isSignedOutError(apiError(401, 'UNAUTHENTICATED'))).toBe(true)
    expect(isSignedOutError(apiError(403, 'FORBIDDEN'))).toBe(false)
  })
})
