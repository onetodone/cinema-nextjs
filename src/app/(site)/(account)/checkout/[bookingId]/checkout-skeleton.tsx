import { Skeleton } from '@/components/ui/skeleton'

/** The checkout's layout while the session is checked and the booking loads. */
export function CheckoutSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-9 w-48 sm:h-10" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-5 w-80 max-w-full" />
          </div>
          <Skeleton className="h-36 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}
