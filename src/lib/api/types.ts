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
