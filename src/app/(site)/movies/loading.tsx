import { MovieGridSkeleton } from '@/components/catalog/movie-card'
import { PageContainer } from '@/components/layout/page'
import { MoviesHeader } from './movies-header'

export default function MoviesLoading() {
  return (
    <PageContainer>
      <MoviesHeader />
      <MovieGridSkeleton count={12} />
    </PageContainer>
  )
}
