import { isApiError } from '@/lib/api/errors'

// Idempotency keys make retries of a hold or a payment safe: the API answers a request whose key it has seen with
// the stored answer of the first one (`Idempotent-Replayed: true`) instead of running it again. So a key lives as
// long as its attempt: it is sent again when the answer was lost or asked for a retry, and replaced once an answer
// is final — the API stores those, and the same key would only replay them.

/** A new key: a random UUID (v4). */
export function newIdempotencyKey(): string {
  // randomUUID exists only in secure contexts (https, localhost); getRandomValues everywhere, a LAN address included.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Whether a failed request used up its key: the API stored its answer, so a new attempt needs a new key. A key stays
 * usable after no answer at all, a 5xx, an answer with `Retry-After` (busy, rate-limited, provider unavailable),
 * and a 401 (the request never got past sign-in): the API stores none of those, and sending the same key again is
 * what keeps such a retry from running twice.
 */
export function isKeySpent(error: unknown): boolean {
  if (!isApiError(error)) return false
  if (error.status === 0 || error.status >= 500 || error.status === 401) return false
  return error.retryAfter === undefined
}
