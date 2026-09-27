import type { components } from '@/lib/api/schema'

type Schemas = components['schemas']

export type Problem = Schemas['Problem']
export type Movie = Schemas['Movie']
export type MovieList = Schemas['MovieList']
export type MovieDetails = Schemas['MovieDetails']
export type MovieRef = Schemas['MovieRef']
export type HallRef = Schemas['HallRef']
export type Showtime = Schemas['Showtime']
export type Schedule = Schemas['Schedule']
export type SeatType = Schemas['SeatType']
export type SeatStatus = Schemas['SeatStatus']
export type Seat = Schemas['Seat']
export type SeatMap = Schemas['SeatMap']
export type User = Schemas['User']
/** The answer of a login or refresh: the access token, its lifetime in seconds, and the account. */
export type TokenResponse = Schemas['AccessToken']
/** A signed-in browser or device of the caller (`GET /v1/auth/sessions`). */
export type AuthSession = Schemas['Session']
export type BookedSeat = Schemas['BookedSeat']
export type BookingStatus = Schemas['BookingStatus']
export type Booking = Schemas['Booking']
export type BookingList = Schemas['BookingList']
export type PaymentMethod = Schemas['PaymentMethod']
export type Payment = Schemas['Payment']
/** The answer of a payment: the payment and its booking as the payment left them. */
export type PaymentResult = Schemas['PaymentResult']
