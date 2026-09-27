import * as z from 'zod'

// Client-side checks that mirror the API's (cinema-api domain.CheckEmail / CheckPassword), so most mistakes are
// caught before a request. The API has the final say and answers 400 VALIDATION_FAILED with the same fields.

const MAX_EMAIL_LENGTH = 254
export const MIN_PASSWORD_LENGTH = 8
/** bcrypt reads only the first 72 bytes, so the API refuses longer passwords. */
const MAX_PASSWORD_BYTES = 72

// Kept as typed: the API compares addresses in any letter case but stores them as given.
const email = z
  .string()
  .trim()
  .min(1, { error: 'Enter your email address.' })
  .max(MAX_EMAIL_LENGTH, { error: `Email must be at most ${MAX_EMAIL_LENGTH} characters.` })
  .pipe(z.email({ error: 'Enter a valid email address, like ann@example.com.' }))

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Enter your password.' }),
})

export const registerSchema = z.object({
  email,
  password: z
    .string()
    // Characters, not UTF-16 units: an emoji counts once, as it does for the API.
    .refine((value) => Array.from(value).length >= MIN_PASSWORD_LENGTH, {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    })
    .refine((value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES, {
      error: 'Password is too long: use at most 72 characters (fewer with accented letters or emoji).',
    }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
