import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

/**
 * A booking id that does not exist, or belongs to another account (the API does not say which). It stands in for the
 * whole page, so its title is the page's heading.
 */
export function BookingNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">Booking not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This booking doesn&apos;t exist, or it belongs to another account.
      </p>
      <Link href="/schedule" className={buttonVariants({ variant: 'outline' })}>
        See the schedule
      </Link>
    </div>
  )
}
