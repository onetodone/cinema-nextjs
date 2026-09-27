// The channel that keeps this origin's tabs' data in step: when a tab holds seats, cancels a hold, or sees a payment
// end, the other tabs refetch what it changed (the hold pill, an open checkout, a seat map). Messages carry ids only,
// never personal data. BroadcastChannel never delivers a message to the tab that sent it.

const CHANNEL_NAME = 'cinema-sync'

export interface BookingsChange {
  bookingId?: string
  showtimeId?: number
}

export type SyncMessage = { type: 'bookings-changed' } & BookingsChange

let channel: BroadcastChannel | null | undefined

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof window === 'undefined' || typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(CHANNEL_NAME)
  }
  return channel
}

export function postSyncMessage(message: SyncMessage): void {
  getChannel()?.postMessage(message)
}

/** Calls `listener` for every message from other tabs; returns the unsubscribe function. */
export function subscribeSyncMessages(listener: (message: SyncMessage) => void): () => void {
  const target = getChannel()
  if (!target) return () => {}
  const onMessage = (event: MessageEvent<SyncMessage>) => listener(event.data)
  target.addEventListener('message', onMessage)
  return () => target.removeEventListener('message', onMessage)
}
