import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { SyncMessage } from '@/lib/sync'
import { queryKeys } from '@/lib/queries/keys'
import { BookingSyncListener } from '@/components/providers/booking-sync'

const sync = vi.hoisted(() => ({
  listener: null as ((message: SyncMessage) => void) | null,
  postSyncMessage: vi.fn(),
}))
vi.mock('@/lib/sync', () => ({
  postSyncMessage: sync.postSyncMessage,
  subscribeSyncMessages: (listener: (message: SyncMessage) => void) => {
    sync.listener = listener
    return () => {
      sync.listener = null
    }
  },
}))

describe('BookingSyncListener', () => {
  it('refetches bookings and the seat map another tab changed, without echoing the message', () => {
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <BookingSyncListener />
      </QueryClientProvider>,
    )

    sync.listener!({ type: 'bookings-changed', bookingId: 'b-1', showtimeId: 7 })

    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: queryKeys.private.bookings() }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.catalog.seatMap(7) })
    expect(sync.postSyncMessage).not.toHaveBeenCalled()
    unmount()
    expect(sync.listener).toBeNull()
  })
})
