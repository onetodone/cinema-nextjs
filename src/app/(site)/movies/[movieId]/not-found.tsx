import Link from 'next/link'
import { PageContainer } from '@/components/layout/page'
import { buttonVariants } from '@/components/ui/button'

export default function MovieNotFound() {
  return (
    <PageContainer className="items-center justify-center text-center">
      <h1 className="text-2xl font-semibold">Movie not found</h1>
      <p className="text-muted-foreground">This movie isn&apos;t in our catalog, or its link is wrong.</p>
      <Link href="/movies" className={buttonVariants()}>
        See all movies
      </Link>
    </PageContainer>
  )
}
