import { ShowtimesByDaySkeleton } from '@/components/catalog/showtimes-by-day'
import { Skeleton } from '@/components/ui/skeleton'

export function MovieDetailsSkeleton() {
  return (
    <div
      className="grid grid-cols-[7.5rem_1fr] gap-x-5 gap-y-8 sm:grid-cols-[15rem_1fr] sm:gap-x-10"
      aria-hidden="true"
    >
      <Skeleton className="aspect-2/3 w-full rounded-lg sm:row-span-2" />
      <div className="flex flex-col gap-3 self-center sm:self-start">
        <Skeleton className="h-8 w-3/4 sm:h-10" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 hidden h-4 w-full max-w-xl sm:block" />
        <Skeleton className="hidden h-4 w-2/3 max-w-md sm:block" />
      </div>
      <div className="col-span-2 flex flex-col gap-4 sm:col-span-1 sm:col-start-2">
        <Skeleton className="h-7 w-32" />
        <ShowtimesByDaySkeleton />
      </div>
    </div>
  )
}
