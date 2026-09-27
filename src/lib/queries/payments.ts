import { queryOptions } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { unwrap, unwrapWithResponse } from '@/lib/api/problem'
import { publicApi } from '@/lib/api/public'
import type { PaymentResult } from '@/lib/api/types'
import { queryKeys } from '@/lib/queries/keys'
import { recordServerTime } from '@/lib/server-clock'

/**
 * A payment without an answer after this long counts as lost; it is then sent again with the same key. The API gives
 * the provider 10 s by default before it answers 202.
 */
const PAY_TIMEOUT_MS = 30_000

/** The payment methods the API takes now (public, and rarely changing). */
export function paymentMethodsQuery() {
  return queryOptions({
    queryKey: queryKeys.catalog.paymentMethods(),
    queryFn: async ({ signal }) => (await unwrap(publicApi.GET('/v1/payment-methods', { signal }))).items,
    staleTime: 5 * 60_000,
  })
}

export interface PayRequest {
  method: string
  token: string
  idempotencyKey: string
}

export interface PayAnswer {
  result: PaymentResult
  /** 202: the provider has not answered yet; the booking is processing until the API settles the payment. */
  accepted: boolean
  /** The API repeated the stored answer of an earlier request with the same key. */
  replayed: boolean
}

/** Pays for a booking. Rejects with an ApiError; see `payOutcome` for what each one means. */
export async function payBooking(bookingId: string, { method, token, idempotencyKey }: PayRequest): Promise<PayAnswer> {
  const { data, response } = await unwrapWithResponse(
    api.POST('/v1/bookings/{bookingID}/payments', {
      params: { path: { bookingID: bookingId }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { payment_method: method, payment_token: token },
      signal: AbortSignal.timeout(PAY_TIMEOUT_MS),
    }),
  )
  recordServerTime(response)
  return {
    result: data,
    accepted: response.status === 202,
    replayed: response.headers.get('Idempotent-Replayed') === 'true',
  }
}
