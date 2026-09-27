import { MAX_SEATS_PER_BOOKING } from '@/lib/seat-map'
import { readSessionValue, removeSessionValue, writeSessionValue } from '@/lib/storage'

// A guest's seat selection waits in this tab's sessionStorage while they sign in, and is picked up again when they
// come back to the showtime. Seats taken meanwhile are dropped then, with a note (see useSeatSelection).

function storageKey(showtimeId: number): string {
  return `cinema:selection:${showtimeId}`
}

export function saveSelection(showtimeId: number, seatIds: readonly number[]): void {
  writeSessionValue(storageKey(showtimeId), { seatIds })
}

/** The saved selection of a showtime, removed from storage as it is read; null when there is none. */
export function takeSavedSelection(showtimeId: number): number[] | null {
  const key = storageKey(showtimeId)
  const value = readSessionValue(key)
  if (value === null) return null
  removeSessionValue(key)
  const seatIds = typeof value === 'object' ? (value as { seatIds?: unknown }).seatIds : undefined
  if (!Array.isArray(seatIds)) return null
  const valid = seatIds.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
  return [...new Set(valid)].slice(0, MAX_SEATS_PER_BOOKING)
}
