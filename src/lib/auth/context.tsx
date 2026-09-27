'use client'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queries/keys'
import {
  ensureBooted,
  getServerSessionSnapshot,
  getSessionSnapshot,
  onUserChange,
  refreshIfStale,
  subscribeSession,
  type SessionSnapshot,
} from '@/lib/auth/session'

/**
 * Starts the tab's session and keeps it fresh when the tab comes back (background timers are throttled). Personal
 * query data is dropped whenever the signed-in user changes, so one account never sees another's.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  useEffect(() => onUserChange(() => queryClient.removeQueries({ queryKey: queryKeys.private.all })), [queryClient])

  useEffect(() => {
    void ensureBooted()

    const onFocus = () => {
      if (document.visibilityState === 'visible') refreshIfStale()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
    }
  }, [])

  return children
}

/**
 * The session's status and user. `loading` during server rendering and hydration (the token lives in the browser
 * only), so the first render always matches the server's HTML.
 */
export function useAuth(): SessionSnapshot {
  return useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSessionSnapshot)
}
