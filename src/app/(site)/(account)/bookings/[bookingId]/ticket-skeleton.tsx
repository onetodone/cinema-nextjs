import { Skeleton } from '@/components/ui/skeleton'

/** The ticket page's layout while the session is checked and the booking loads. */
export function TicketSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-56 sm:h-10" />
      </div>
      <Skeleton className="h-72 rounded-2xl sm:h-60" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  )
}
