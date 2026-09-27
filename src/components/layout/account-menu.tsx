'use client'

import Link from 'next/link'
import { toast } from 'sonner'
import { LogOutIcon, TicketIcon, UserRoundIcon } from 'lucide-react'
import type { User } from '@/lib/api/types'
import { signOut } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
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

/** The signed-in user's menu in the header: who is signed in, My bookings, Account, and Sign out. */
export function AccountMenu({ user }: { user: User }) {
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
