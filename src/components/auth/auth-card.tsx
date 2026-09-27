'use client'

import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { safeNextPath } from '@/lib/auth/next-path'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** The card of the sign-in and registration pages; its title is the page's heading. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string
  description: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="justify-center text-muted-foreground">{footer}</CardFooter>
    </Card>
  )
}

/** The auth card while the page decides (a signed-in visitor is on the way out). */
export function AuthCardSkeleton() {
  return (
    <Card className="w-full max-w-sm" aria-busy="true">
      <CardHeader>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </CardContent>
      <CardFooter className="justify-center">
        <Skeleton className="h-4 w-44" />
      </CardFooter>
    </Card>
  )
}

function linkWithNext(page: '/login' | '/register', next: string | null): string {
  const path = safeNextPath(next)
  return path ? `${page}?next=${encodeURIComponent(path)}` : page
}

function NextAwareLink({ page, children }: { page: '/login' | '/register'; children: ReactNode }) {
  const next = useSearchParams().get('next')
  return (
    <Link href={linkWithNext(page, next)} className="font-medium text-foreground underline underline-offset-4">
      {children}
    </Link>
  )
}

/**
 * A link between the sign-in and registration pages that keeps `?next=`. The query string is unknown while the page
 * is prerendered, so the prerendered link goes without it until the browser renders this.
 */
export function AuthSwitchLink({ page, children }: { page: '/login' | '/register'; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={page} className="font-medium text-foreground underline underline-offset-4">
          {children}
        </Link>
      }
    >
      <NextAwareLink page={page}>{children}</NextAwareLink>
    </Suspense>
  )
}
