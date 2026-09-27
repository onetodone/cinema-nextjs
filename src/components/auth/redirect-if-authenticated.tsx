'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { safeNextPath } from '@/lib/auth/next-path'

/**
 * For the sign-in and registration pages: a signed-in user goes on to `?next=` (or home). This is also how those
 * forms leave after a successful sign-in, so there is one place that navigates. Guests, and visitors whose session
 * is still being checked, see `children`.
 */
export function RedirectIfAuthenticated({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const { status } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (status !== 'authenticated') return
    router.replace(safeNextPath(new URLSearchParams(window.location.search).get('next')) ?? '/')
  }, [status, router])

  // Unmounting the form on success also drops the typed password from memory (Next keeps hidden pages' state).
  return status === 'authenticated' ? fallback : children
}
