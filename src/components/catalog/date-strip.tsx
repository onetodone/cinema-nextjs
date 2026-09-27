'use client'

import { useLayoutEffect, useRef } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { addDays, dayParts, formatLongDay } from '@/lib/time'
import { scheduleHref } from '@/lib/catalog'
import { cn } from '@/lib/utils'

interface DateStripProps {
  /** The cinema's current date, `YYYY-MM-DD`. */
  today: string
  /** The day on screen. */
  selected: string
  /** The movie filter to keep while switching days. */
  movieId: number | null
  days: number
}

/** A row of day links starting today, scrollable on phones; the selected day is scrolled into view. */
export function DateStrip({ today, selected, movieId, days }: DateStripProps) {
  const listRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const current = list?.querySelector<HTMLElement>('[aria-current="date"]')
    if (!list || !current) return
    // Scroll the strip itself, not the page: scrollIntoView would also move the window on phones.
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2
  }, [selected])

  return (
    <nav aria-label="Days">
      <ul
        ref={listRef}
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:thin]"
      >
        {Array.from({ length: days }, (_, offset) => {
          const date = addDays(today, offset)
          const { weekday, day, month } = dayParts(date)
          const current = date === selected
          return (
            <li key={date} className="snap-start">
              <Link
                href={scheduleHref({ date: offset === 0 ? undefined : date, movieId })}
                aria-current={current ? 'date' : undefined}
                aria-label={offset === 0 ? `Today, ${formatLongDay(date)}` : formatLongDay(date)}
                scroll={false}
                className={cn(
                  'flex w-14 flex-col items-center rounded-lg border px-1 py-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  current
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-card-foreground hover:border-primary/60 hover:bg-accent',
                )}
              >
                <DayLabel weekday={offset === 0 ? 'Today' : weekday} day={day} month={month} current={current} />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function DayLabel({ weekday, day, month, current }: { weekday: string; day: string; month: string; current: boolean }) {
  // Pending while the next day's schedule loads (the old one stays on screen meanwhile).
  const { pending } = useLinkStatus()
  return (
    <span className={cn('flex flex-col items-center', pending && 'animate-pulse')}>
      <span className={cn('text-xs', current ? 'font-medium' : 'text-muted-foreground')}>{weekday}</span>
      <span className="text-lg leading-tight font-semibold tabular-nums">{day}</span>
      <span className={cn('text-xs', current ? '' : 'text-muted-foreground')}>{month}</span>
    </span>
  )
}
