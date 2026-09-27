export interface FieldError {
  field: string
  message: string
}

interface ApiErrorInit {
  status: number
  code: string
  detail?: string
  requestId?: string
  fieldErrors?: FieldError[]
  unavailableSeatIds?: number[]
  declineCode?: string
  bookingId?: string
  retryAfter?: number
}

/**
 * A failed API call. `code` is the problem's stable machine-readable code (RFC 9457 extension), or one of the
 * client-side codes `NETWORK` (no answer) and `UNEXPECTED_RESPONSE` (an answer that is not a problem document).
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly detail?: string
  readonly requestId?: string
  readonly fieldErrors: FieldError[]
  readonly unavailableSeatIds: number[]
  readonly declineCode?: string
  readonly bookingId?: string
  /** Seconds from `Retry-After`, when the answer is worth retrying unchanged. */
  readonly retryAfter?: number

  constructor(message: string, init: ApiErrorInit) {
    super(message)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.requestId = init.requestId
    this.fieldErrors = init.fieldErrors ?? []
    this.unavailableSeatIds = init.unavailableSeatIds ?? []
    this.declineCode = init.declineCode
    this.bookingId = init.bookingId
    this.retryAfter = init.retryAfter
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
