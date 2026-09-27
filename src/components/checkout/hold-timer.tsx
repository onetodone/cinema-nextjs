'use client'

import { TimerIcon } from 'lucide-react'
import { HOLD_WARNING_MS } from '@/lib/checkout'
import { formatCountdown, instantOf } from '@/lib/time'
import { cn } from '@/lib/utils'

/** Moments worth announcing to screen readers (the timer itself is not read out every second). */
const ANNOUNCEMENTS: { atMs: number; text: string }[] = [
  { atMs: 60_000, text: 'One minute left to pay.' },
  { atMs: HOLD_WARNING_MS, text: 'Two minutes left to pay.' },
  { atMs: 5 * 60_000, text: 'Five minutes left to pay.' },
]

function announcementFor(remainingMs: number): string {
  return ANNOUNCEMENTS.find(({ atMs }) => remainingMs <= atMs)?.text ?? ''
}

/**
 * How long the seats stay held, counting down by the server's clock: a bar of the time left, and a warning in the
 * last two minutes. `remainingMs` comes from useCountdown (null before hydration).
 */
export function HoldTimer({
  remainingMs,
  createdAt,
  expiresAt,
}: {
  remainingMs: number | null
  createdAt: string
  expiresAt: string
}) {
  const total = instantOf(expiresAt) - instantOf(createdAt)
  const fraction = remainingMs === null || !(total > 0) ? 1 : Math.min(1, remainingMs / total)
  const warning = remainingMs !== null && remainingMs <= HOLD_WARNING_MS

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        warning ? 'border-destructive/40 bg-destructive/10' : 'border-primary/40 bg-primary/10',
      )}
    >
      <div className="flex items-center gap-3">
        <TimerIcon className={cn('size-5 shrink-0', warning ? 'text-destructive' : 'text-primary')} aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="font-medium">{warning ? 'Your hold ends soon' : 'Your seats are held'}</p>
          <p className="text-sm text-muted-foreground">
            {warning ? 'Pay now to keep them.' : 'Pay before the time runs out to keep them.'}
          </p>
        </div>
        <p
          role="timer"
          aria-label="Time left to pay"
          className={cn('text-2xl font-semibold tabular-nums', warning && 'text-destructive')}
        >
          {remainingMs === null ? '–:––' : formatCountdown(remainingMs)}
        </p>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none',
            warning ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {remainingMs === null ? '' : announcementFor(remainingMs)}
      </p>
    </div>
  )
}
