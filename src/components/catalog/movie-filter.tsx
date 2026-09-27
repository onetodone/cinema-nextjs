import Link from 'next/link'
import type { MovieRef } from '@/lib/api/types'
import { scheduleHref } from '@/lib/catalog'
import { cn } from '@/lib/utils'

/** Links that narrow a day's schedule to one movie, keeping the day. */
export function MovieFilter({
  movies,
  selectedId,
  date,
}: {
  movies: Pick<MovieRef, 'id' | 'title'>[]
  selectedId: number | null
  date?: string
}) {
  return (
    <nav aria-label="Filter by movie">
      <ul className="flex flex-wrap gap-2">
        <li>
          <FilterLink href={scheduleHref({ date })} current={selectedId === null}>
            All movies
          </FilterLink>
        </li>
        {movies.map((movie) => (
          <li key={movie.id}>
            <FilterLink href={scheduleHref({ date, movieId: movie.id })} current={movie.id === selectedId}>
              {movie.title}
            </FilterLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function FilterLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        current
          ? 'border-primary bg-primary/15 font-medium text-foreground'
          : 'text-muted-foreground hover:border-primary/60 hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}
