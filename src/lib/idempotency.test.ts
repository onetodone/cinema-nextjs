import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { isKeySpent, newIdempotencyKey } from '@/lib/idempotency'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const apiError = (status: number, code: string, retryAfter?: number) => new ApiError(code, { status, code, retryAfter })

describe('newIdempotencyKey', () => {
  it('makes a new UUID every time', () => {
    const first = newIdempotencyKey()
    expect(first).toMatch(UUID_V4)
    expect(newIdempotencyKey()).not.toBe(first)
  })

  it('works outside secure contexts, where randomUUID is missing', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })

    expect(newIdempotencyKey()).toMatch(UUID_V4)
  })
})

describe('isKeySpent', () => {
  it('keeps the key when the answer was lost or asks for the same request again', () => {
    expect(isKeySpent(apiError(0, 'NETWORK'))).toBe(false)
    expect(isKeySpent(apiError(500, 'INTERNAL'))).toBe(false)
    expect(isKeySpent(apiError(502, 'UNEXPECTED_RESPONSE'))).toBe(false)
    expect(isKeySpent(apiError(409, 'SEAT_BUSY', 1))).toBe(false)
    expect(isKeySpent(apiError(409, 'IDEMPOTENCY_IN_PROGRESS', 1))).toBe(false)
    expect(isKeySpent(apiError(429, 'RATE_LIMITED', 12))).toBe(false)
    expect(isKeySpent(apiError(401, 'TOKEN_EXPIRED'))).toBe(false)
    expect(isKeySpent(new Error('not an API error'))).toBe(false)
  })

  it('spends the key on answers the API stores', () => {
    expect(isKeySpent(apiError(409, 'SEAT_UNAVAILABLE'))).toBe(true)
    expect(isKeySpent(apiError(409, 'ACTIVE_BOOKING_EXISTS'))).toBe(true)
    expect(isKeySpent(apiError(422, 'IDEMPOTENCY_KEY_REUSED'))).toBe(true)
    expect(isKeySpent(apiError(402, 'PAYMENT_DECLINED'))).toBe(true)
    expect(isKeySpent(apiError(404, 'SHOWTIME_NOT_FOUND'))).toBe(true)
  })
})
