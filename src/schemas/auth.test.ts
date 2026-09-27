import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from '@/schemas/auth'

/** The first message per field, as the forms show them. */
function errorsOf(result: ReturnType<typeof registerSchema.safeParse>): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of result.error?.issues ?? []) fields[String(issue.path[0])] ??= issue.message
  return fields
}

describe('loginSchema', () => {
  it('trims the address and keeps its letter case', () => {
    expect(loginSchema.parse({ email: '  Ann@Example.com ', password: 'x' })).toEqual({
      email: 'Ann@Example.com',
      password: 'x',
    })
  })

  it('asks for both fields, one message each', () => {
    const result = loginSchema.safeParse({ email: '   ', password: '' })
    expect(errorsOf(result)).toEqual({ email: 'Enter your email address.', password: 'Enter your password.' })
    expect(result.error?.issues).toHaveLength(2)
  })

  it('refuses an address that is not one', () => {
    expect(errorsOf(loginSchema.safeParse({ email: 'ann@', password: 'x' }))).toEqual({
      email: 'Enter a valid email address, like ann@example.com.',
    })
  })

  it('refuses an address longer than 254 characters', () => {
    const email = `${'a'.repeat(64)}@${'b'.repeat(186)}.com`
    expect(email).toHaveLength(255)
    expect(errorsOf(loginSchema.safeParse({ email, password: 'x' }))).toEqual({
      email: 'Email must be at most 254 characters.',
    })
  })
})

describe('registerSchema', () => {
  it('counts characters, not UTF-16 units, towards the minimum', () => {
    // Four emoji are eight UTF-16 units but four characters.
    expect(errorsOf(registerSchema.safeParse({ email: 'ann@example.com', password: '🎬🎬🎬🎬' }))).toEqual({
      password: 'Password must be at least 8 characters.',
    })
    expect(registerSchema.safeParse({ email: 'ann@example.com', password: '12345678' }).success).toBe(true)
  })

  it('refuses a password beyond the 72 bytes bcrypt reads', () => {
    expect(registerSchema.safeParse({ email: 'ann@example.com', password: 'a'.repeat(72) }).success).toBe(true)
    // 36 two-byte letters are 72 bytes; one more is too many.
    expect(registerSchema.safeParse({ email: 'ann@example.com', password: 'é'.repeat(36) }).success).toBe(true)
    expect(errorsOf(registerSchema.safeParse({ email: 'ann@example.com', password: 'é'.repeat(37) }))).toEqual({
      password: 'Password is too long: use at most 72 characters (fewer with accented letters or emoji).',
    })
  })
})
