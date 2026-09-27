import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarIcon, ClockIcon, MapPinIcon } from 'lucide-react'
import { getSeatMapSnapshot, getShowtime } from '@/lib/api/server'
import type { Showtime } from '@/lib/api/types'
import { parseId } from '@/lib/catalog'
import { logger } from '@/lib/logger'
import { formatLongDay, formatShowtime, formatShowtimeDateTime, instantOf, localDateOf } from '@/lib/time'
import { movieMeta } from '@/components/catalog/movie-card'
import { BackLink } from '@/components/layout/back-link'
import { PageContainer } from '@/components/layout/page'
import { SectionErrorBoundary } from '@/components/layout/section-error'
import { SeatPicker } from '@/components/seat-map/seat-picker'
import { Badge } from '@/components/ui/badge'
import { SeatPickerSkeleton, ShowtimeSkeleton } from './showtime-skeleton'

async function findShowtime(showtimeId: string): Promise<Showtime | null> {
  const id = parseId(showtimeId)
  return id === null ? null : getShowtime(id)
}

export async function generateMetadata({ params }: PageProps<'/showtimes/[showtimeId]'>): Promise<Metadata> {
  const { showtimeId } = await params
  let showtime: Showtime | null
  try {
    showtime = await findShowtime(showtimeId)
  } catch (error) {
    logger.warn('metadata.showtime_unavailable', { showtimeId, error })
    return { title: 'Showtime' }
  }
  if (!showtime) return { title: 'Showtime not found', robots: { index: false } }

  const when = formatShowtimeDateTime(showtime.starts_at)
  return {
    title: `${showtime.movie.title} · ${when}`,
    description: `Pick your seats for ${showtime.movie.title} in ${showtime.hall.name}, ${when}.`,
    // Showtimes come and go within days: keep them out of search results, but let crawlers follow their links.
    robots: { index: false, follow: true },
  }
}

export default function ShowtimePage({ params }: PageProps<'/showtimes/[showtimeId]'>) {
  return (
    <PageContainer className="gap-6 pb-0 sm:pb-0">
      <SectionErrorBoundary what="this showtime" pageHeading>
        <Suspense fallback={<ShowtimeSkeleton />}>
          <ShowtimeView params={params} />
        </Suspense>
      </SectionErrorBoundary>
    </PageContainer>
  )
}

async function ShowtimeView({ params }: Pick<PageProps<'/showtimes/[showtimeId]'>, 'params'>) {
  const { showtimeId } = await params
  const showtime = await findShowtime(showtimeId)
  if (!showtime) notFound()

  return (
    <>
      <div className="flex flex-col gap-4">
        <BackLink href={`/movies/${showtime.movie.id}`}>{showtime.movie.title}</BackLink>
        <ShowtimeHeader showtime={showtime} />
      </div>
      <SectionErrorBoundary what="the seat map">
        <Suspense fallback={<SeatPickerSkeleton />}>
          <LiveSeatPicker showtime={showtime} />
        </Suspense>
      </SectionErrorBoundary>
    </>
  )
}

function ShowtimeHeader({ showtime }: { showtime: Showtime }) {
  const canceled = showtime.status === 'canceled'
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{showtime.movie.title}</h1>
        {canceled ? <Badge variant="destructive">Canceled</Badge> : null}
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <li className="inline-flex items-center gap-1.5">
          <CalendarIcon className="size-4" aria-hidden="true" />
          {formatLongDay(localDateOf(showtime.starts_at))}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <ClockIcon className="size-4" aria-hidden="true" />
          {formatShowtime(showtime.starts_at)}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <MapPinIcon className="size-4" aria-hidden="true" />
          {showtime.hall.name}
        </li>
        <li>{movieMeta(showtime.movie)}</li>
      </ul>
    </header>
  )
}

async function LiveSeatPicker({ showtime }: { showtime: Showtime }) {
  const snapshot = await getSeatMapSnapshot(showtime.id)
  if (!snapshot) notFound()
  return (
    <SeatPicker
      showtimeId={showtime.id}
      startsAt={showtime.starts_at}
      canceled={showtime.status === 'canceled'}
      startedWhenFetched={snapshot.fetchedAt >= instantOf(showtime.starts_at)}
      initialSeatMap={snapshot.seatMap}
      fetchedAt={snapshot.fetchedAt}
    />
  )
}
