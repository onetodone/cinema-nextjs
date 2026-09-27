'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function RootErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred. You can try again, or refresh the page.
      </p>
      {/* retry() re-fetches and re-renders the segment; reset() would only re-render it. */}
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  )
}
