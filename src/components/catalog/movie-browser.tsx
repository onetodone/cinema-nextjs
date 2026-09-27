'use client'

import { useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import type { MovieList } from '@/lib/api/types'
import { moviesInfiniteQuery } from '@/lib/queries/catalog'
import { MovieCard, MovieGrid } from '@/components/catalog/movie-card'
import { Button } from '@/components/ui/button'

/**
 * The movies grid: the server-rendered first page, then "Load more" for the next ones. After a load, focus moves to
 * the first new movie, so keyboard users continue where the list grew (the button may be gone on the last page).
 */
export function MovieBrowser({ firstPage }: { firstPage: MovieList }) {
  const query = useInfiniteQuery(moviesInfiniteQuery(firstPage))
  const movies = query.data.pages.flatMap((page) => page.items)

  const gridRef = useRef<HTMLUListElement>(null)
  const focusIndexRef = useRef<number | null>(null)

  useEffect(() => {
    const index = focusIndexRef.current
    if (index === null) return
    const link = gridRef.current?.querySelectorAll<HTMLAnchorElement>(':scope > li > a')[index]
    if (link) {
      focusIndexRef.current = null
      link.focus()
    }
  }, [movies.length])

  function loadMore() {
    focusIndexRef.current = movies.length
    void query.fetchNextPage()
  }

  return (
    <div className="flex flex-col gap-8">
      <MovieGrid ref={gridRef}>
        {movies.map((movie, index) => (
          <li key={movie.id}>
            <MovieCard movie={movie} titleAs="h2" priority={index < 4} eager={index < 8} />
          </li>
        ))}
      </MovieGrid>
      <p className="sr-only" aria-live="polite">
        {movies.length} {movies.length === 1 ? 'movie' : 'movies'} shown
      </p>
      {query.isFetchNextPageError ? (
        <p role="alert" className="text-center text-sm text-destructive">
          We couldn&apos;t load more movies. Please try again.
        </p>
      ) : null}
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" onClick={loadMore} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            {query.isFetchingNextPage ? 'Loading…' : 'Load more movies'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
