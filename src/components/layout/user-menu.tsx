'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { LogOutIcon, TicketIcon, UserRoundIcon } from 'lucide-react'
import type { User } from '@/lib/api/types'
import { useAuth } from '@/lib/auth/context'
import { loginHref } from '@/lib/auth/next-path'
import { signOut } from '@/lib/auth/session'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The header's account area: a placeholder of the same size while the session is checked (always, during server
 * rendering: the token lives in the browser), then "Sign in" or the account menu.
 */
export function UserMenu() {
  const { status, user } = useAuth()

  if (status === 'loading') return <Skeleton className="h-8 w-18" />
  if (status === 'authenticated' && user) return <AccountMenu user={user} />
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

function AccountMenu({ user }: { user: User }) {
  function handleSignOut() {
    void signOut()
    toast.success('You have signed out.', { id: 'signed-out' })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={`Account: ${user.email}`} />}
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground uppercase"
        >
          {user.email.charAt(0)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            Signed in as
            <span className="truncate text-sm font-medium text-popover-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLinkItem render={<Link href="/bookings" />}>
          <TicketIcon aria-hidden="true" />
          My bookings
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem render={<Link href="/account" />}>
          <UserRoundIcon aria-hidden="true" />
          Account
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
