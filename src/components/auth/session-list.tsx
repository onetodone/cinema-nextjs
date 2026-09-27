'use client'

import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GlobeIcon, MonitorIcon, RotateCwIcon, SmartphoneIcon, TabletIcon } from 'lucide-react'
import { errorMessage } from '@/lib/api/messages'
import type { AuthSession } from '@/lib/api/types'
import { queryKeys } from '@/lib/queries/keys'
import { revokeSession, sessionsQuery } from '@/lib/queries/sessions'
import { formatDate, formatTimeAgo } from '@/lib/time'
import { describeUserAgent, deviceLabel, type DeviceKind } from '@/lib/user-agent'
import { useNow } from '@/hooks/use-now'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const DEVICE_ICON: Record<DeviceKind, typeof MonitorIcon> = {
  desktop: MonitorIcon,
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  unknown: GlobeIcon,
}

/**
 * The browsers and devices signed in to the account: this one first, then the others, most recently used first. Any
 * other one can be signed out from here; this one signs out with "Sign out".
 */
export function SessionList({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const { data: sessions, isPending, isError, error, refetch, isRefetching } = useQuery(sessionsQuery())
  const now = useNow()

  if (sessions && now !== null) {
    const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current))
    return (
      <ul className="flex flex-col divide-y rounded-xl border">
        {ordered.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            now={now}
            // The row, and the button that had focus, are gone: continue from the list's heading.
            onRevoked={() => headingRef.current?.focus()}
          />
        ))}
      </ul>
    )
  }
  if (isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>We couldn&apos;t load where you&apos;re signed in. {errorMessage(error)}</span>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isRefetching}>
          <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
    )
  }
  return isPending || now === null ? <SessionListSkeleton /> : null
}

function SessionRow({ session, now, onRevoked }: { session: AuthSession; now: number; onRevoked: () => void }) {
  const detailsId = useId()
  const device = describeUserAgent(session.user_agent)
  const label = deviceLabel(device)
  const Icon = DEVICE_ICON[device.kind]
  const facts = [
    session.current ? 'Active now' : `Last active ${formatTimeAgo(session.last_used_at, now)}`,
    `signed in ${formatDate(session.created_at)}`,
    session.ip,
  ].filter(Boolean)

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      {/* On phones the button goes under the text, which needs the whole width. */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
            <span className="min-w-0 break-words">{label}</span>
            {session.current ? <Badge>This device</Badge> : null}
          </p>
          <p id={detailsId} className="text-sm break-words text-muted-foreground">
            {facts.join(' · ')}
          </p>
        </div>
        {session.current ? null : (
          <RevokeSessionButton session={session} label={label} detailsId={detailsId} onRevoked={onRevoked} />
        )}
      </div>
    </li>
  )
}

function RevokeSessionButton({
  session,
  label,
  detailsId,
  onRevoked,
}: {
  session: AuthSession
  label: string
  detailsId: string
  onRevoked: () => void
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const revoke = useMutation({
    mutationFn: () => revokeSession(session.id),
    onSuccess: () => {
      queryClient.setQueryData<AuthSession[]>(queryKeys.private.sessions(), (sessions) =>
        sessions?.filter((other) => other.id !== session.id),
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.private.sessions() })
      toast.success(`${label} was signed out.`, { id: `revoked-${session.id}` })
      onRevoked()
    },
    onError: (error) => {
      toast.error(`Couldn’t sign out ${label}. ${errorMessage(error)}`, { id: `revoke-failed-${session.id}` })
      setOpen(false)
    },
  })

  return (
    <AlertDialog open={open} onOpenChange={(next) => !revoke.isPending && setOpen(next)}>
      <AlertDialogTrigger
        render={<Button variant="outline" aria-label={`Sign out ${label}`} aria-describedby={detailsId} />}
      >
        Sign out
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            It is signed out at once, and has to sign in again to book. Seats it holds stay held until their time runs
            out.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => revoke.mutate()} disabled={revoke.isPending}>
            {revoke.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SessionListSkeleton() {
  return (
    <div className="flex flex-col divide-y rounded-xl border" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
