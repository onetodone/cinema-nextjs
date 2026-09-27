import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { toApiError, unwrap, unwrapOrNull } from '@/lib/api/problem'

function problemResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

describe('toApiError', () => {
  it('reads the RFC 9457 members and the extensions the UI branches on', () => {
    const error = toApiError(problemResponse(409, { 'Retry-After': '2' }), {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      detail: 'Seats C7 and C8 are no longer available.',
      code: 'SEAT_UNAVAILABLE',
      request_id: 'req-1',
      unavailable_seat_ids: [61, 62, 'x'],
      booking_id: '0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a77',
      decline_code: 'insufficient_funds',
      errors: [{ field: 'seat_ids', message: 'must not be empty' }, { nonsense: true }],
    })

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'SEAT_UNAVAILABLE',
      message: 'Seats C7 and C8 are no longer available.',
      requestId: 'req-1',
      unavailableSeatIds: [61, 62],
      bookingId: '0199a1f0-7c1e-7d2a-9b3e-5f0c2d1e4a77',
      declineCode: 'insufficient_funds',
      retryAfter: 2,
      fieldErrors: [
        { field: 'seat_ids', message: 'must not be empty' },
        { field: '', message: 'is invalid' },
      ],
    })
  })

  it('copes with answers that are not problem documents', () => {
    const error = toApiError(new Response(null, { status: 502, statusText: 'Bad Gateway' }), '<html>')

    expect(error.code).toBe('UNEXPECTED_RESPONSE')
    expect(error.status).toBe(502)
    expect(error.message).toBe('502 Bad Gateway')
    expect(error.retryAfter).toBeUndefined()
  })

  it('takes the request id from the header when the body has none', () => {
    const error = toApiError(problemResponse(500, { 'X-Request-ID': 'req-2' }), { code: 'INTERNAL' })
    expect(error.requestId).toBe('req-2')
  })
})

describe('unwrap', () => {
  it('returns the data of a successful call', async () => {
    await expect(unwrap(Promise.resolve({ data: { ok: true }, response: problemResponse(200) }))).resolves.toEqual({
      ok: true,
    })
  })

  it('throws an ApiError for a problem answer', async () => {
    const pending = Promise.resolve({ error: { code: 'MOVIE_NOT_FOUND' }, response: problemResponse(404) })
    await expect(unwrap(pending)).rejects.toMatchObject({ status: 404, code: 'MOVIE_NOT_FOUND' })
  })

  it('turns a failed fetch into a NETWORK error', async () => {
    const pending = Promise.reject(new TypeError('fetch failed'))
    await expect(unwrap(pending)).rejects.toMatchObject({ status: 0, code: 'NETWORK' })
  })

  it('resolves a 404 to null with unwrapOrNull, and rethrows the rest', async () => {
    await expect(
      unwrapOrNull(Promise.resolve({ error: { code: 'SHOWTIME_NOT_FOUND' }, response: problemResponse(404) })),
    ).resolves.toBeNull()
    await expect(
      unwrapOrNull(Promise.resolve({ error: { code: 'INTERNAL' }, response: problemResponse(500) })),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})
