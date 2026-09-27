import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCinemaToday, getMovie } from '@/lib/api/server'
import type { MovieDetails } from '@/lib/api/types'
import { parseId } from '@/lib/catalog'
import { logger } from '@/lib/logger'
import { movieMeta } from '@/components/catalog/movie-card'
import { Poster } from '@/components/catalog/poster'
import { ShowtimesByDay } from '@/components/catalog/showtimes-by-day'
import { BackLink } from '@/components/layout/back-link'
import { EmptyState, PageContainer } from '@/components/layout/page'
import { SectionErrorBoundary } from '@/components/layout/section-error'
import { MovieDetailsSkeleton } from './movie-details-skeleton'

async function findMovie(movieId: string): Promise<MovieDetails | null> {
  const id = parseId(movieId)
  return id === null ? null : getMovie(id)
}

export async function generateMetadata({ params }: PageProps<'/movies/[movieId]'>): Promise<Metadata> {
  const { movieId } = await params
  let movie: MovieDetails | null
  try {
    movie = await findMovie(movieId)
  } catch (error) {
    // The page's own error boundary reports the failure; the metadata falls back to a generic title.
    logger.warn('metadata.movie_unavailable', { movieId, error })
    return { title: 'Movie' }
  }
  if (!movie) return { title: 'Movie not found', robots: { index: false } }

  const description = movie.description ?? `Showtimes and tickets for ${movie.title}.`
  return {
    title: movie.title,
    description,
    alternates: { canonical: `/movies/${movie.id}` },
    openGraph: {
      type: 'video.movie',
      title: movie.title,
      description,
      url: `/movies/${movie.id}`,
      images: movie.poster_url ? [{ url: movie.poster_url, alt: `Poster of ${movie.title}` }] : undefined,
    },
  }
}

export default function MoviePage({ params }: PageProps<'/movies/[movieId]'>) {
  return (
    <PageContainer className="gap-6">
      <BackLink href="/movies">All movies</BackLink>
      <SectionErrorBoundary what="this movie" pageHeading>
        <Suspense fallback={<MovieDetailsSkeleton />}>
          <MovieView params={params} />
        </Suspense>
      </SectionErrorBoundary>
    </PageContainer>
  )
}

async function MovieView({ params }: Pick<PageProps<'/movies/[movieId]'>, 'params'>) {
  const { movieId } = await params
  const [movie, today] = await Promise.all([findMovie(movieId), getCinemaToday()])
  if (!movie) notFound()

  return (
    <article className="grid grid-cols-[7.5rem_1fr] gap-x-5 gap-y-8 sm:grid-cols-[15rem_1fr] sm:gap-x-10">
      <Poster movie={movie} priority sizes="(min-width: 640px) 240px, 120px" className="sm:row-span-2" />
      <header className="flex flex-col gap-2 self-center sm:self-start">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-4xl">{movie.title}</h1>
        <p className="text-muted-foreground">{movieMeta(movie)}</p>
        {movie.description ? <p className="mt-2 hidden max-w-2xl text-pretty sm:block">{movie.description}</p> : null}
      </header>
      <div className="col-span-2 flex flex-col gap-8 sm:col-span-1 sm:col-start-2">
        {movie.description ? <p className="text-pretty sm:hidden">{movie.description}</p> : null}
        <section aria-labelledby="showtimes" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="showtimes" className="text-xl font-semibold tracking-tight">
              Showtimes
            </h2>
            <Link
              href={`/schedule?movie=${movie.id}`}
              className="rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Open in the schedule
            </Link>
          </div>
          {movie.upcoming_showtimes.length === 0 ? (
            <EmptyState title="No upcoming showtimes">This movie is not scheduled in the next two weeks.</EmptyState>
          ) : (
            <ShowtimesByDay showtimes={movie.upcoming_showtimes} today={today} />
          )}
        </section>
      </div>
    </article>
  )
}
