import Link from 'next/link'
import { PageContainer } from '@/components/layout/page'
import { Button } from '@/components/ui/button'

export default function MovieNotFound() {
  return (
    <PageContainer className="items-center justify-center text-center">
      <h1 className="text-2xl font-semibold">Movie not found</h1>
      <p className="text-muted-foreground">This movie isn&apos;t in our catalog, or its link is wrong.</p>
      <Button nativeButton={false} render={<Link href="/movies" />}>
        See all movies
      </Button>
    </PageContainer>
  )
}
