import Link from 'next/link'
import { ClapperboardIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { APP_NAME } from '@/lib/site'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <ClapperboardIcon className="size-5 text-primary" aria-hidden="true" />
          <span>{APP_NAME}</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
