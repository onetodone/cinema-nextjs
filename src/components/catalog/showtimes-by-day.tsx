import type { Showtime } from '@/lib/api/types'
import { groupShowtimesByDay } from '@/lib/catalog'
import { formatDay, relativeDayLabel } from '@/lib/time'
import { ShowtimeChip } from '@/components/catalog/showtime-chip'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Showtimes grouped by the cinema's calendar day. With `today` (the cinema's date, from the API), the first days
 * read "Today" and "Tomorrow".
 */
export function ShowtimesByDay({ showtimes, today }: { showtimes: Showtime[]; today: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      {groupShowtimesByDay(showtimes).map(({ date, showtimes: day }) => {
        const label = today ? relativeDayLabel(date, today) : formatDay(date)
        const absolute = formatDay(date)
        return (
          <div key={date} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              {label}
              {label !== absolute ? <span className="font-normal text-muted-foreground"> · {absolute}</span> : null}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {day.map((showtime) => (
                <li key={showtime.id}>
                  <ShowtimeChip showtime={showtime} />
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function ShowtimesByDaySkeleton({ days = 3 }: { days?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {Array.from({ length: days }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, chip) => (
              <Skeleton key={chip} className="h-[4.25rem] w-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
