import type { Metadata } from 'next'
import Link from 'next/link'
import { PageContainer } from '@/components/layout/page'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { buttonVariants } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Page not found',
}

// An address that matches no route. It renders outside the site layout, so it brings the header and footer itself:
// the visitor keeps the navigation instead of a dead end.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex min-h-[calc(100svh-3.5rem)] flex-1 flex-col outline-none">
        <PageContainer className="items-center justify-center text-center">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonVariants()}>
              Go home
            </Link>
            <Link href="/schedule" className={buttonVariants({ variant: 'outline' })}>
              See the schedule
            </Link>
          </div>
        </PageContainer>
      </main>
      <SiteFooter />
    </>
  )
}
