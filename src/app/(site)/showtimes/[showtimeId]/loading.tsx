import { PageContainer } from '@/components/layout/page'
import { ShowtimeSkeleton } from './showtime-skeleton'

export default function ShowtimeLoading() {
  return (
    <PageContainer className="gap-6 pb-0 sm:pb-0">
      <ShowtimeSkeleton />
    </PageContainer>
  )
}
