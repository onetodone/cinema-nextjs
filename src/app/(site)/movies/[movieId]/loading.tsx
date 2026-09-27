import { BackLink } from '@/components/layout/back-link'
import { PageContainer } from '@/components/layout/page'
import { MovieDetailsSkeleton } from './movie-details-skeleton'

export default function MovieLoading() {
  return (
    <PageContainer className="gap-6">
      <BackLink href="/movies">All movies</BackLink>
      <MovieDetailsSkeleton />
    </PageContainer>
  )
}
