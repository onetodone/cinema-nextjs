import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthGuard } from '@/components/auth/auth-guard'
import { PageContainer } from '@/components/layout/page'
import { TicketSkeleton } from './ticket-skeleton'
import { TicketView } from './ticket-view'

export const metadata: Metadata = {
  title: 'Your ticket',
}

export default function BookingPage({ params }: PageProps<'/bookings/[bookingId]'>) {
  return (
    <PageContainer className="max-w-3xl">
      {/* The booking id is known at request time only: the prerendered shell shows the skeleton. */}
      <Suspense fallback={<TicketSkeleton />}>
        <GuardedTicket params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function GuardedTicket({ params }: Pick<PageProps<'/bookings/[bookingId]'>, 'params'>) {
  const { bookingId } = await params
  return (
    <AuthGuard fallback={<TicketSkeleton />}>
      <TicketView bookingId={bookingId} />
    </AuthGuard>
  )
}
