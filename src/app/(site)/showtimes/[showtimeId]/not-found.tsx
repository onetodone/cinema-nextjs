import Link from 'next/link'
import { PageContainer } from '@/components/layout/page'
import { buttonVariants } from '@/components/ui/button'

export default function ShowtimeNotFound() {
  return (
    <PageContainer className="items-center justify-center text-center">
      <h1 className="text-2xl font-semibold">Showtime not found</h1>
      <p className="text-muted-foreground">This showtime doesn&apos;t exist, or its link is wrong.</p>
      <Link href="/schedule" className={buttonVariants()}>
        See the schedule
      </Link>
    </PageContainer>
  )
}
