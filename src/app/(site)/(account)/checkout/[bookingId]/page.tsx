import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AuthGuard } from '@/components/auth/auth-guard'
import { PageContainer } from '@/components/layout/page'
import { CheckoutSkeleton } from './checkout-skeleton'
import { CheckoutView } from './checkout-view'

export const metadata: Metadata = {
  title: 'Checkout',
}

export default function CheckoutPage({ params }: PageProps<'/checkout/[bookingId]'>) {
  return (
    <PageContainer className="max-w-5xl">
      {/* The booking id is known at request time only: the prerendered shell shows the skeleton. */}
      <Suspense fallback={<CheckoutSkeleton />}>
        <GuardedCheckout params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function GuardedCheckout({ params }: Pick<PageProps<'/checkout/[bookingId]'>, 'params'>) {
  const { bookingId } = await params
  return (
    <AuthGuard fallback={<CheckoutSkeleton />}>
      <CheckoutView bookingId={bookingId} />
    </AuthGuard>
  )
}
