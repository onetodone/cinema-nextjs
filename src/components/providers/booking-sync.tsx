'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshAfterBookingsChange } from '@/lib/queries/bookings'
import { subscribeSyncMessages } from '@/lib/sync'

/** Refetches bookings (and the seat map) that another tab has changed: a hold, a cancel, a payment. */
export function BookingSyncListener() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeSyncMessages((message) => {
        if (message?.type !== 'bookings-changed') return
        refreshAfterBookingsChange(queryClient, {
          bookingId: typeof message.bookingId === 'string' ? message.bookingId : undefined,
          showtimeId: typeof message.showtimeId === 'number' ? message.showtimeId : undefined,
        })
      }),
    [queryClient],
  )

  return null
}
