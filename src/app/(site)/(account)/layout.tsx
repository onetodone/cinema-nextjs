import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// Personal pages: nothing to index. Each page guards itself with <AuthGuard>, so its fallback can be its own
// layout-shaped skeleton.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children
}
