import { BookingCardSkeleton } from '@/components/bookings/booking-card'
import { Skeleton } from '@/components/ui/skeleton'

/** The bookings list while the session is checked and the first page loads. */
export function BookingsSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-28" />
        <div className="flex flex-col gap-3">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-44" />
        <div className="flex flex-col gap-3">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      </div>
    </div>
  )
}
