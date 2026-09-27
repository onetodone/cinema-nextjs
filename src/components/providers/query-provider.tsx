'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Public data is server-rendered first; a short stale time avoids an immediate refetch after hydration.
        staleTime: 30_000,
        // Never poll in the background: the seat map pauses while the tab is hidden and catches up on focus.
        refetchIntervalInBackground: false,
        retry: 1,
      },
      mutations: {
        // Mutations are retried deliberately (same idempotency key, after Retry-After), never automatically.
        retry: false,
      },
    },
  })
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser tab, created lazily so it survives re-renders but never leaks between requests on the
  // server.
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Rendered only in development; the package ships a no-op in production builds. */}
      <ReactQueryDevtools buttonPosition="bottom-left" />
    </QueryClientProvider>
  )
}
