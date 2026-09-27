'use client'

import { Fragment, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCwIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { loginHref } from '@/lib/auth/next-path'
import { retrySession } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'

/**
 * Renders `children` for a signed-in user only. While the session is checked it shows `fallback` — the page's own
 * layout-shaped skeleton, the same one it shows while its data loads, so nothing jumps. A guest is sent to the
 * sign-in page, which brings them back here.
 *
 * This is a UX guard, not a security boundary: the API refuses personal data without a valid token either way.
 */
export function AuthGuard({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const { status, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (status !== 'unauthenticated') return
    router.replace(loginHref(`${window.location.pathname}${window.location.search}`))
  }, [status, router])

  if (status === 'error') return <SessionCheckFailed />
  if (status !== 'authenticated' || !user) return fallback
  // Keyed by account: when another account signs in (in another tab), the page starts over with that account's data.
  return <Fragment key={user.id}>{children}</Fragment>
}

function SessionCheckFailed() {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center"
    >
      <p className="font-medium">We couldn&apos;t check your sign-in.</p>
      <p className="text-sm text-muted-foreground">
        The cinema&apos;s server can&apos;t be reached right now. Check your connection and try again.
      </p>
      <Button variant="outline" onClick={() => retrySession({ visibly: true })}>
        <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
        Try again
      </Button>
    </div>
  )
}
