'use client'

import { RotateCwIcon } from 'lucide-react'
import { errorMessage, errorReference } from '@/lib/api/messages'
import { Button } from '@/components/ui/button'

/** A client-side read failed: what, why, and "Try again". */
export function LoadError({
  what,
  error,
  onRetry,
  retrying = false,
  pageHeading = false,
}: {
  what: string
  error: unknown
  onRetry: () => void
  retrying?: boolean
  /** It stands in for the whole page: the message is the page's heading. */
  pageHeading?: boolean
}) {
  const reference = errorReference(error)
  const Title = pageHeading ? 'h1' : 'p'
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center"
    >
      <Title className="font-medium">We couldn&apos;t load {what}.</Title>
      <p className="text-sm text-muted-foreground">
        {errorMessage(error)}
        {reference ? ` Reference: ${reference}` : null}
      </p>
      <Button variant="outline" onClick={onRetry} disabled={retrying}>
        <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
        Try again
      </Button>
    </div>
  )
}
