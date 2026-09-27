'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LogOutIcon, RotateCwIcon } from 'lucide-react'
import { errorMessage } from '@/lib/api/messages'
import { useAuth } from '@/lib/auth/context'
import { signOut, signOutEverywhere } from '@/lib/auth/session'
import { meQuery } from '@/lib/queries/account'
import { formatDate } from '@/lib/time'
import { SessionList } from '@/components/auth/session-list'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** The account page's content, for a signed-in user (behind AuthGuard). */
export function AccountView() {
  return (
    <div className="flex flex-col gap-6">
      <ProfileCard />
      <SessionsCard />
    </div>
  )
}

function ProfileCard() {
  const { user } = useAuth()
  const { data: me, isPending, isError, error, refetch, isRefetching } = useQuery(meQuery())

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="profile-heading">Profile</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email</dt>
            {/* Known from the session at once; the profile call only adds what the session does not carry. */}
            <dd className="truncate text-base">{me?.email ?? user?.email}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Member since</dt>
            <dd className="text-base">
              {me ? formatDate(me.created_at) : isPending ? <Skeleton className="h-6 w-36" /> : '—'}
            </dd>
          </div>
        </dl>
        {isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>We couldn&apos;t load your profile. {errorMessage(error)}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
              <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SessionsCard() {
  const headingRef = useRef<HTMLHeadingElement>(null)

  function handleSignOut() {
    void signOut()
    toast.success('You have signed out.', { id: 'signed-out' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="sessions-heading" ref={headingRef} tabIndex={-1} className="outline-none">
            Where you&apos;re signed in
          </h2>
        </CardTitle>
        <CardDescription>
          Browsers and devices signed in to your account. Signing one out ends its session at once. &ldquo;Sign out
          everywhere&rdquo; ends them all, this one included.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SessionList headingRef={headingRef} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={handleSignOut}>
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
            Sign out
          </Button>
          <SignOutEverywhereDialog />
        </div>
      </CardContent>
    </Card>
  )
}

function SignOutEverywhereDialog() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await signOutEverywhere()
      toast.success('You have signed out on every device.', { id: 'signed-out' })
    } catch (error) {
      toast.error(`Couldn’t sign out everywhere. ${errorMessage(error)}`)
      setPending(false)
      setOpen(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger render={<Button variant="destructive" size="lg" />}>Sign out everywhere</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out on every device?</AlertDialogTitle>
          <AlertDialogDescription>
            Every session of your account ends at once — this browser and any other device you&rsquo;re signed in on.
            Seats you hold stay held until their time runs out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
            {pending ? 'Signing out…' : 'Sign out everywhere'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
