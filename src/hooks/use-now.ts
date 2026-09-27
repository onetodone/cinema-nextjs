import { useSyncExternalStore } from 'react'
import { instantOf } from '@/lib/time'

// A shared clock for "has this started yet?" checks. It is null during server rendering and hydration (the server
// cannot know the viewer's moment, and a guess would cause a hydration mismatch), then ticks every 15 seconds on one
// shared timer, however many components read it.

const TICK_MS = 15_000

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  timer ??= setInterval(() => listeners.forEach((notify) => notify()), TICK_MS)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

// Rounded to the tick, so repeated reads between ticks return the same value (a store snapshot must be stable).
function getSnapshot(): number {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS
}

function getServerSnapshot(): null {
  return null
}

/** The current time in epoch milliseconds, at 15-second resolution; null before hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Whether a showtime has started by the viewer's clock; false until hydration. */
export function useHasStarted(startsAt: string): boolean {
  const now = useNow()
  return now !== null && now >= instantOf(startsAt)
}
