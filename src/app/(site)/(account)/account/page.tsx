import type { Metadata } from 'next'
import { AuthGuard } from '@/components/auth/auth-guard'
import { PageContainer, PageHeader } from '@/components/layout/page'
import { AccountSkeleton } from './account-skeleton'
import { AccountView } from './account-view'

export const metadata: Metadata = {
  title: 'Account',
}

export default function AccountPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Account" description="Your profile, and where you're signed in." />
      <AuthGuard fallback={<AccountSkeleton />}>
        <AccountView />
      </AuthGuard>
    </PageContainer>
  )
}
