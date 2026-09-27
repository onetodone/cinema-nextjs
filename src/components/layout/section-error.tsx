'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { RotateCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

function SectionErrorFallback(
  { what, pageHeading = false }: { what: string; pageHeading?: boolean },
  { retry }: ErrorInfo,
) {
  // A section that holds the page's own heading fails with it: the message then is the page's heading.
  const Title = pageHeading ? 'h1' : 'p'
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center"
    >
      <Title className="font-medium">We couldn&apos;t load {what}.</Title>
      <p className="text-sm text-muted-foreground">The cinema&apos;s server may be busy. Please try again.</p>
      {/* retry() re-fetches the section from the server; the rest of the page keeps its state. */}
      <Button variant="outline" onClick={() => retry()}>
        <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
        Try again
      </Button>
    </div>
  )
}

/**
 * An error boundary for one data section, so a failed API read leaves the page's shell and other sections in place.
 * `notFound()` and redirects pass through it. `pageHeading`: the section holds the page's `<h1>`.
 */
export const SectionErrorBoundary = catchError(SectionErrorFallback)
