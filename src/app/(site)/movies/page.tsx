import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getMoviesPage } from '@/lib/api/server'
import { MovieBrowser } from '@/components/catalog/movie-browser'
import { MovieGridSkeleton } from '@/components/catalog/movie-card'
import { EmptyState, PageContainer } from '@/components/layout/page'
import { SectionErrorBoundary } from '@/components/layout/section-error'
import { MoviesHeader } from './movies-header'

export const metadata: Metadata = {
  title: 'Movies',
  description: 'Every movie on our screens. Pick one to see its showtimes and book seats.',
  alternates: { canonical: '/movies' },
}

export default function MoviesPage() {
  return (
    <PageContainer>
      <MoviesHeader />
      <SectionErrorBoundary what="the movies">
        <Suspense fallback={<MovieGridSkeleton count={12} />}>
          <Movies />
        </Suspense>
      </SectionErrorBoundary>
    </PageContainer>
  )
}

async function Movies() {
  const firstPage = await getMoviesPage()
  if (firstPage.items.length === 0) return <EmptyState title="No movies yet">Check back soon.</EmptyState>
  return <MovieBrowser firstPage={firstPage} />
}
