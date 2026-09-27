import { useSyncExternalStore } from 'react'
import { serverSkewMs } from '@/lib/server-clock'
import { instantOf, remainingMs } from '@/lib/time'

// A shared one-second clock for hold countdowns: one timer however many countdowns show (the checkout and the header
// pill), ticking on the second boundaries so every countdown turns over together. Null during server rendering and
// hydration, like useNow: the server cannot know the viewer's moment.

const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined

function tick(): void {
  listeners.forEach((notify) => notify())
  schedule()
}

function schedule(): void {
  timer = setTimeout(tick, 1_000 - (Date.now() % 1_000) + 5)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === undefined) schedule()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearTimeout(timer)
      timer = undefined
    }
  }
}

// Whole seconds, so repeated reads within a second return the same value (a store snapshot must be stable).
function getSnapshot(): number {
  return Math.floor(Date.now() / 1_000) * 1_000
}

function getServerSnapshot(): null {
  return null
}

/**
 * Milliseconds left until `expiresAt` by the server's clock (corrected for this device's skew), updated every second;
 * 0 once it has passed; null before hydration or without a deadline. With `startedAt`, never more than the time from
 * `startedAt` to `expiresAt` (the clocks' rounding would otherwise show a fresh 15-minute hold as 15:01).
 */
export function useCountdown(expiresAt: string | null | undefined, startedAt?: string): number | null {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  if (now === null || !expiresAt) return null
  const left = remainingMs(expiresAt, now, serverSkewMs())
  const length = startedAt ? instantOf(expiresAt) - instantOf(startedAt) : Number.NaN
  return length > 0 ? Math.min(left, length) : left
}
