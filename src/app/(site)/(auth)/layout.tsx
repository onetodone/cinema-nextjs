import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageContainer } from '@/components/layout/page'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PageContainer className="items-center justify-center">{children}</PageContainer>
}
