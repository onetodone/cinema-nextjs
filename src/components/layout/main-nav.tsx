'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/movies', label: 'Movies', matches: ['/movies'] },
  { href: '/schedule', label: 'Schedule', matches: ['/schedule', '/showtimes'] },
] as const

function isActive(pathname: string | null, matches: readonly string[]): boolean {
  if (!pathname) return false
  return matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map(({ href, label, matches }) => {
        const active = isActive(pathname, matches)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
              active && 'text-foreground',
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

/** The main navigation without the current page marked: the prerendered fallback while the pathname is unknown. */
export function MainNavFallback() {
  return <NavLinks pathname={null} />
}

/** The main navigation, marking the current section. Render it inside Suspense (see MainNavFallback). */
export function MainNav() {
  return <NavLinks pathname={usePathname()} />
}
