import { ScheduleListSkeleton } from '@/components/catalog/schedule-list'
import { SCHEDULE_DAYS } from '@/lib/catalog'
import { Skeleton } from '@/components/ui/skeleton'

export function ScheduleSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-2 sm:mx-0 sm:px-0">
        {Array.from({ length: SCHEDULE_DAYS }, (_, index) => (
          <Skeleton key={index} className="h-[4.75rem] w-14 shrink-0 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-56" />
        <ScheduleListSkeleton />
      </div>
    </div>
  )
}
