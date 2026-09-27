'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { isApiError } from '@/lib/api/errors'

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Public data is server-rendered first; a short stale time avoids an immediate refetch after hydration.
        staleTime: 30_000,
        // Never poll in the background: the seat map pauses while the tab is hidden and catches up on focus.
        refetchIntervalInBackground: false,
        // One retry for failures that may pass (no answer, 5xx); a 4xx answer would come back the same. A 401 has
        // already been through a token refresh in the auth-aware client.
        retry: (failureCount, error) =>
          failureCount < 1 && !(isApiError(error) && error.status >= 400 && error.status < 500),
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
