import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, CalendarDaysIcon, ClapperboardIcon } from 'lucide-react'
import { getMoviesPage, getSchedule } from '@/lib/api/server'
import { groupShowtimesByMovie } from '@/lib/catalog'
import { formatLongDay } from '@/lib/time'
import { APP_DESCRIPTION } from '@/lib/site'
import { MovieCard, MovieGrid, MovieGridSkeleton } from '@/components/catalog/movie-card'
import { ScheduleList, ScheduleListSkeleton } from '@/components/catalog/schedule-list'
import { EmptyState, PageContainer, SectionHeader } from '@/components/layout/page'
import { SectionErrorBoundary } from '@/components/layout/section-error'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const NOW_SHOWING_COUNT = 8

export default function HomePage() {
  return (
    <PageContainer className="gap-14">
      <section className="flex flex-col gap-5 pt-4 sm:pt-8">
        <p className="text-sm font-medium tracking-widest text-primary uppercase">Now showing</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your seat is waiting.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{APP_DESCRIPTION}</p>
        <div className="flex flex-wrap gap-2">
          {/* Links styled as buttons: they navigate, so they keep the link role. */}
          <Link href="/schedule" className={buttonVariants({ size: 'lg' })}>
            <CalendarDaysIcon data-icon="inline-start" aria-hidden="true" />
            Today&apos;s schedule
          </Link>
          <Link href="/movies" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            <ClapperboardIcon data-icon="inline-start" aria-hidden="true" />
            Browse movies
          </Link>
        </div>
      </section>

      <section aria-labelledby="now-showing" className="flex flex-col gap-5">
        <SectionHeader id="now-showing" title="Now showing" action={<MoreLink href="/movies">All movies</MoreLink>} />
        <SectionErrorBoundary what="the movies">
          <Suspense fallback={<MovieGridSkeleton count={NOW_SHOWING_COUNT} />}>
            <NowShowing />
          </Suspense>
        </SectionErrorBoundary>
      </section>

      <section aria-labelledby="today" className="flex flex-col gap-5">
        <SectionHeader id="today" title="Today" action={<MoreLink href="/schedule">Full schedule</MoreLink>} />
        <SectionErrorBoundary what="today's schedule">
          <Suspense fallback={<TodayScheduleSkeleton />}>
            <TodaySchedule />
          </Suspense>
        </SectionErrorBoundary>
      </section>
    </PageContainer>
  )
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
      <ArrowRightIcon className="size-4" aria-hidden="true" />
    </Link>
  )
}

async function NowShowing() {
  // The same first page as /movies, so both share one cache entry.
  const { items } = await getMoviesPage()
  if (items.length === 0) return <EmptyState title="No movies yet">Check back soon.</EmptyState>

  return (
    <MovieGrid>
      {items.slice(0, NOW_SHOWING_COUNT).map((movie, index) => (
        <li key={movie.id}>
          <MovieCard movie={movie} priority={index < 4} eager={index < 8} />
        </li>
      ))}
    </MovieGrid>
  )
}

async function TodaySchedule() {
  const schedule = await getSchedule()
  const groups = groupShowtimesByMovie(schedule.items)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{formatLongDay(schedule.date)}</p>
      {groups.length === 0 ? (
        <EmptyState title="Nothing is showing today">
          <Link href="/schedule" className="text-primary hover:underline">
            See the coming days
          </Link>
        </EmptyState>
      ) : (
        <ScheduleList groups={groups} />
      )}
    </div>
  )
}

function TodayScheduleSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-5 w-48" />
      <ScheduleListSkeleton />
    </div>
  )
}
