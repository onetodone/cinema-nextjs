import Link from 'next/link'
import type { Movie } from '@/lib/api/types'
import { formatDuration } from '@/lib/time'
import { Poster } from '@/components/catalog/poster'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4'

/** "PG-13 · 1 h 58 min". */
export function movieMeta(movie: Pick<Movie, 'age_rating' | 'duration_min'>): string {
  return [movie.age_rating, formatDuration(movie.duration_min)].filter(Boolean).join(' · ')
}

export function MovieCard({
  movie,
  titleAs: Title = 'h3',
  priority = false,
  eager = priority,
}: {
  movie: Movie
  titleAs?: 'h2' | 'h3'
  /** Preload the poster (the first row). */
  priority?: boolean
  /** Load the poster at once (rows above the fold). */
  eager?: boolean
}) {
  return (
    <Link
      href={`/movies/${movie.id}`}
      className="group flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Poster
        movie={movie}
        priority={priority}
        eager={eager}
        sizes="(min-width: 1024px) 272px, (min-width: 640px) 33vw, 50vw"
        className="transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      />
      <div className="flex flex-col gap-0.5">
        <Title className="leading-snug font-medium text-pretty group-hover:text-primary">{movie.title}</Title>
        <p className="text-sm text-muted-foreground">{movieMeta(movie)}</p>
      </div>
    </Link>
  )
}

export function MovieGrid({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn(GRID_CLASS, className)} {...props} />
}

export function MovieGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="aspect-2/3 w-full rounded-lg" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}
