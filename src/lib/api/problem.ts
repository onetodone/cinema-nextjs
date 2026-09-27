import { ApiError, type FieldError } from '@/lib/api/errors'

const NETWORK_MESSAGE = 'Network error. Check your connection and try again.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  // The HTTP-date form: the API sends seconds, but a proxy in between might not.
  const at = Date.parse(header)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/**
 * Turns a failed answer into an ApiError. `body` is what openapi-fetch parsed (a problem document for the API's
 * errors), or anything else when a proxy answered instead.
 */
export function toApiError(response: Response, body: unknown): ApiError {
  const problem = isRecord(body) ? body : {}
  const code = optionalString(problem.code) ?? 'UNEXPECTED_RESPONSE'
  const detail = optionalString(problem.detail)

  const fieldErrors: FieldError[] = Array.isArray(problem.errors)
    ? problem.errors.filter(isRecord).map((item) => ({
        field: typeof item.field === 'string' ? item.field : '',
        message: typeof item.message === 'string' ? item.message : 'is invalid',
      }))
    : []
  const unavailableSeatIds = Array.isArray(problem.unavailable_seat_ids)
    ? problem.unavailable_seat_ids.filter((id): id is number => typeof id === 'number')
    : []

  return new ApiError(detail ?? `${response.status} ${response.statusText || code}`.trim(), {
    status: response.status,
    code,
    detail,
    requestId: optionalString(problem.request_id) ?? response.headers.get('X-Request-ID') ?? undefined,
    fieldErrors,
    unavailableSeatIds,
    declineCode: optionalString(problem.decline_code),
    bookingId: optionalString(problem.booking_id),
    retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
  })
}

/** The request never got an answer (offline, DNS, connection refused, aborted by a timeout). */
export function networkError(cause?: unknown): ApiError {
  const error = new ApiError(NETWORK_MESSAGE, { status: 0, code: 'NETWORK' })
  if (cause !== undefined) error.cause = cause
  return error
}

/** The shape of an openapi-fetch result. */
interface ApiResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Resolves an openapi-fetch call to its data, or throws an ApiError (a network failure included). */
export async function unwrap<T>(pending: Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>
  try {
    result = await pending
  } catch (cause) {
    throw networkError(cause)
  }
  if (result.error !== undefined || !result.response.ok) throw toApiError(result.response, result.error)
  return result.data as T
}

/** Like `unwrap`, but a 404 resolves to null: the resource does not exist. */
export async function unwrapOrNull<T>(pending: Promise<ApiResult<T>>): Promise<T | null> {
  try {
    return await unwrap(pending)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}
