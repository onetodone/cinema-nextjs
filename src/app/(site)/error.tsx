'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCwIcon } from 'lucide-react'
import { PageContainer } from '@/components/layout/page'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * A page failed in a way none of its sections caught. Rendered inside the site layout, so the header — navigation,
 * account, a hold's way back to its checkout — stays usable.
 */
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PageContainer className="items-center justify-center text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-pretty text-muted-foreground">
        This page couldn&apos;t be shown. You can try again, or start over from the home page.
        {error.digest ? ` Reference: ${error.digest}` : null}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {/* retry() re-fetches and re-renders the segment; reset() would only re-render it. */}
        <Button onClick={() => retry()}>
          <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'outline' })}>
          Go home
        </Link>
      </div>
    </PageContainer>
  )
}
