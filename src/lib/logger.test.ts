import { describe, expect, it } from 'vitest'
import { maskSecrets } from '@/lib/logger'

describe('maskSecrets', () => {
  it('redacts values under sensitive keys, at any depth', () => {
    const masked = maskSecrets({
      email: 'ann@example.com',
      password: 'hunter2',
      nested: { access_token: 'abc', Cookie: 'cinema_refresh=x.y' },
    })

    expect(masked).toEqual({
      email: 'ann@example.com',
      password: '[redacted]',
      nested: { access_token: '[redacted]', Cookie: '[redacted]' },
    })
  })

  it('redacts JWTs, bearer tokens, and secret query parameters inside strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzaWQiOiIxMjMifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ'

    expect(maskSecrets(`token ${jwt} expired`)).toBe('token [redacted] expired')
    expect(maskSecrets('Authorization: Bearer abc.def-ghi')).toBe('Authorization: Bearer [redacted]')
    expect(maskSecrets('/v1/x?refresh_token=abc&keep=1')).toBe('/v1/x?refresh_token=[redacted]&keep=1')
  })

  it('survives circular structures', () => {
    const node: Record<string, unknown> = { name: 'loop' }
    node.self = node

    expect(maskSecrets(node)).toEqual({ name: 'loop', self: '[circular]' })
  })
})
