import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <Button nativeButton={false} render={<Link href="/" />}>
        Go home
      </Button>
    </main>
  )
}
