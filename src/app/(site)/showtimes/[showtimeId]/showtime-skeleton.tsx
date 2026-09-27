import { Skeleton } from '@/components/ui/skeleton'

export function ShowtimeHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-6 w-40" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-72 max-w-full sm:h-9" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
    </div>
  )
}

export function SeatPickerSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-24" />
          ))}
        </div>
      </div>
      <Skeleton className="-mx-4 h-96 rounded-none sm:mx-0 sm:rounded-xl" />
      <Skeleton className="-mx-4 h-16 rounded-none sm:mx-0 sm:rounded-t-xl sm:rounded-b-none" />
    </div>
  )
}

export function ShowtimeSkeleton() {
  return (
    <>
      <ShowtimeHeaderSkeleton />
      <SeatPickerSkeleton />
    </>
  )
}
