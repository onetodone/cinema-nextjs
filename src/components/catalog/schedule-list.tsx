import Link from 'next/link'
import type { MovieShowtimes } from '@/lib/catalog'
import { movieMeta } from '@/components/catalog/movie-card'
import { ShowtimeChip } from '@/components/catalog/showtime-chip'
import { Skeleton } from '@/components/ui/skeleton'

/** A day's showtimes grouped by movie: the movie on the left, its showtimes as chips on the right. */
export function ScheduleList({ groups }: { groups: MovieShowtimes[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-xl border bg-card text-card-foreground">
      {groups.map(({ movie, showtimes }) => (
        <li key={movie.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="flex flex-col gap-0.5 sm:w-56 sm:shrink-0 sm:pt-1">
            <h3 className="leading-snug font-medium text-pretty">
              <Link
                href={`/movies/${movie.id}`}
                className="rounded-sm outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {movie.title}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">{movieMeta(movie)}</p>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label={`Showtimes of ${movie.title}`}>
            {showtimes.map((showtime) => (
              <li key={showtime.id}>
                <ShowtimeChip showtime={showtime} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function ScheduleListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col divide-y rounded-xl border bg-card" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 p-4 sm:flex-row sm:gap-6">
          <div className="flex flex-col gap-1.5 sm:w-56 sm:shrink-0 sm:pt-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }, (_, chip) => (
              <Skeleton key={chip} className="h-[4.25rem] w-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
