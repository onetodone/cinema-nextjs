import { isApiError, type ApiError } from '@/lib/api/errors'

// What the UI says about a failed API call: one place for the copy, keyed by the problem's stable `code`. The API's
// `detail` is only a fallback for codes this client does not know (it is written for developers). Screens with
// their own handling of a code (a seat conflict, a declined card) say more around these messages.

const SESSION_ENDED = 'Your session has ended. Please sign in again.'
const TRY_AGAIN = 'Something went wrong. Please try again.'

const MESSAGES: Record<string, string> = {
  // Client-side
  NETWORK: 'Can’t reach the cinema’s server. Check your connection and try again.',
  UNEXPECTED_RESPONSE: 'The cinema’s server sent an unexpected answer. Please try again.',

  // Accounts and sessions
  INVALID_CREDENTIALS: 'The email or password is incorrect.',
  EMAIL_TAKEN: 'An account with this email already exists. Sign in instead.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  INVALID_TOKEN: SESSION_ENDED,
  TOKEN_EXPIRED: SESSION_ENDED,
  REFRESH_INVALID: SESSION_ENDED,
  SESSION_NOT_FOUND: 'That session has already ended.',
  USER_NOT_FOUND: 'This account no longer exists.',
  FORBIDDEN: 'You don’t have access to this.',

  // Catalog
  MOVIE_NOT_FOUND: 'This movie doesn’t exist.',
  SHOWTIME_NOT_FOUND: 'This showtime doesn’t exist.',

  // Booking
  SHOWTIME_NOT_BOOKABLE: 'Sales for this showtime are closed.',
  SEAT_UNAVAILABLE: 'Some of these seats were just taken. Please pick others.',
  SEAT_BUSY: 'These seats are being booked right now. Please try again in a moment.',
  UNKNOWN_SEAT: 'Some of these seats don’t exist in this hall any more. The seat map has been updated.',
  TOO_MANY_SEATS: 'That’s more seats than one booking can hold.',
  ACTIVE_BOOKING_EXISTS: 'You already have seats on hold for this showtime.',
  BOOKING_NOT_FOUND: 'This booking doesn’t exist.',
  BOOKING_BUSY: 'This booking is being updated. Please try again in a moment.',
  BOOKING_NOT_CANCELABLE: 'This booking can’t be canceled any more.',
  BOOKING_EXPIRED: 'Your hold on these seats has expired.',
  BOOKING_CANCELED: 'This booking was canceled.',
  BOOKING_ALREADY_PAID: 'This booking is already paid.',

  // Payment
  PAYMENT_DECLINED: 'The payment was declined. Nothing was charged.',
  PAYMENT_IN_PROGRESS: 'A payment for this booking is already being processed.',
  PAYMENT_METHOD_UNAVAILABLE: 'This payment method isn’t available right now. Please choose another.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'The payment provider is unavailable. Please try again shortly.',
  PAYMENT_REFUNDED: 'The payment arrived after the hold ended, and it was refunded.',

  // Requests
  IDEMPOTENCY_IN_PROGRESS: 'Your previous attempt is still being processed. Please wait a moment.',
  IDEMPOTENCY_KEY_REUSED: TRY_AGAIN,
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  MALFORMED_BODY: TRY_AGAIN,
  BODY_TOO_LARGE: TRY_AGAIN,
  UNSUPPORTED_MEDIA_TYPE: TRY_AGAIN,
  NOT_FOUND: 'Not found.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
}

function waitPhrase(seconds: number): string {
  if (seconds <= 1) return 'in a moment'
  if (seconds < 60) return `in ${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`
}

/** The message to show for a failed call. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return TRY_AGAIN
  if (error.status === 429) {
    return `Too many attempts. Please try again ${waitPhrase(error.retryAfter ?? 60)}.`
  }
  return MESSAGES[error.code] ?? error.detail ?? (error.status >= 500 ? MESSAGES.INTERNAL : TRY_AGAIN)
}

/**
 * A reference to quote to support for failures that are the server's fault (5xx), whose request id is in the API's
 * logs; null otherwise.
 */
export function errorReference(error: unknown): string | null {
  return isApiError(error) && error.status >= 500 && error.requestId ? error.requestId : null
}

/** Whether the call failed because this tab has no session (any more): the fix is to sign in. */
export function isSignedOutError(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 401
}
