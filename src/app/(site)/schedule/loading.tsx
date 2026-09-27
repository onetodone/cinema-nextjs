import { PageContainer } from '@/components/layout/page'
import { ScheduleHeader } from './schedule-header'
import { ScheduleSkeleton } from './schedule-skeleton'

export default function ScheduleLoading() {
  return (
    <PageContainer>
      <ScheduleHeader />
      <ScheduleSkeleton />
    </PageContainer>
  )
}
