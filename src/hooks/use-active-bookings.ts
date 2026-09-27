import { useQuery } from '@tanstack/react-query'
import type { Booking } from '@/lib/api/types'
import { useAuth } from '@/lib/auth/context'
import { activeBookingsQuery } from '@/lib/queries/bookings'

const NONE: readonly Booking[] = []

/** The signed-in user's unpaid bookings (none for a guest, or while the session is checked). */
export function useActiveBookings(): readonly Booking[] {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'
  const { data } = useQuery({ ...activeBookingsQuery(), enabled: signedIn })
  return signedIn && data ? data : NONE
}
