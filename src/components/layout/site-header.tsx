import { Suspense } from 'react'
import Link from 'next/link'
import { ClapperboardIcon } from 'lucide-react'
import { ActiveHoldPill } from '@/components/layout/active-hold-pill'
import { MainNav, MainNavFallback } from '@/components/layout/main-nav'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'
import { APP_NAME } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="mr-1 flex items-center gap-2 font-semibold tracking-tight sm:mr-2">
          <ClapperboardIcon className="size-5 text-primary" aria-hidden="true" />
          {/* Below 400px the icon stands alone, so the nav and the account area fit on one line. */}
          <span className="sr-only min-[400px]:not-sr-only">{APP_NAME}</span>
        </Link>
        {/* The pathname of a dynamic route is unknown while prerendering: the fallback marks no link as current. */}
        <Suspense fallback={<MainNavFallback />}>
          <MainNav />
        </Suspense>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:contents">
            <ActiveHoldPill variant="pill" />
          </div>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
      {/* Phones have no room in the row: the hold gets a strip of its own. */}
      <div className="sm:hidden">
        <ActiveHoldPill variant="bar" />
      </div>
    </header>
  )
}
