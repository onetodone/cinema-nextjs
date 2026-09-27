'use client'

import { lazy, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { loginHref } from '@/lib/auth/next-path'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// The menu (Base UI's Menu and its positioning code: about a fifth of the JavaScript every page shared) loads only
// once someone is signed in, so guests never download it.
const AccountMenu = lazy(() =>
  import('@/components/layout/account-menu').then((module) => ({ default: module.AccountMenu })),
)

/**
 * The header's account area: a placeholder of the same size while the session is checked (always, during server
 * rendering: the token lives in the browser), then "Sign in" or the account menu.
 */
export function UserMenu() {
  const { status, user } = useAuth()

  if (status === 'loading') return <Skeleton className="h-8 w-18" />
  if (status === 'authenticated' && user) {
    return (
      <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
        <AccountMenu user={user} />
      </Suspense>
    )
  }
  return <SignInLink />
}

// Rendered after hydration only (the status is `loading` until then), so reading the URL here never holds up
// prerendering.
function SignInLink() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const onAuthPage = pathname === '/login' || pathname === '/register'
  const search = searchParams.toString()
  // Coming back where the visitor is, or keeping the `next` of the auth page they are on.
  const href = onAuthPage ? loginHref(searchParams.get('next')) : loginHref(`${pathname}${search ? `?${search}` : ''}`)

  // A plain link styled as a button: it navigates, so it keeps the link role.
  return (
    <Link href={href} className={buttonVariants({ variant: 'outline' })}>
      Sign in
    </Link>
  )
}
