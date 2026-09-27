import type { Metadata } from 'next'
import { AuthGuard } from '@/components/auth/auth-guard'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { BookingsSkeleton } from './bookings-skeleton'
import { BookingsView } from './bookings-view'

export const metadata: Metadata = {
  title: 'My bookings',
}

export default function BookingsPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="My bookings" description="Your tickets, seats waiting for payment, and past bookings." />
      <AuthGuard fallback={<BookingsSkeleton />}>
        <BookingsView />
      </AuthGuard>
    </PageContainer>
  )
}
