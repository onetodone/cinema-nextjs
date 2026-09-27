import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCinemaToday, getMovie, getSchedule } from '@/lib/api/server'
import { groupShowtimesByMovie, parseId, SCHEDULE_DAYS, scheduleHref } from '@/lib/catalog'
import { formatLongDay, isIsoDate } from '@/lib/time'
import { DateStrip } from '@/components/catalog/date-strip'
import { MovieFilter } from '@/components/catalog/movie-filter'
import { ScheduleList } from '@/components/catalog/schedule-list'
import { EmptyState, PageContainer } from '@/components/layout/page'
import { SectionErrorBoundary } from '@/components/layout/section-error'
import { ScheduleHeader } from './schedule-header'
import { ScheduleSkeleton } from './schedule-skeleton'

export const metadata: Metadata = {
  title: 'Schedule',
  description: 'Every showtime of the day, by movie. Pick one to choose your seats.',
  alternates: { canonical: '/schedule' },
}

export default function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  return (
    <PageContainer>
      <ScheduleHeader />
      <SectionErrorBoundary what="the schedule">
        <Suspense fallback={<ScheduleSkeleton />}>
          <ScheduleView searchParams={searchParams} />
        </Suspense>
      </SectionErrorBoundary>
    </PageContainer>
  )
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function ScheduleView({ searchParams }: Pick<PageProps<'/schedule'>, 'searchParams'>) {
  const query = await searchParams
  // Invalid values are ignored rather than rejected: the page shows today's full schedule instead.
  const dateParam = firstValue(query.date)
  const date = dateParam && isIsoDate(dateParam) ? dateParam : undefined
  const movieParam = firstValue(query.movie)
  const movieId = movieParam ? parseId(movieParam) : null

  const [schedule, today] = await Promise.all([getSchedule(date), getCinemaToday()])

  // The whole day is loaded; the movie filter applies here. Its options are the movies playing that day, plus the
  // selected movie when it is not (so the filter stays visible and can be cleared). An unknown movie is ignored.
  const dayMovies = groupShowtimesByMovie(schedule.items).map(({ movie }) => ({ id: movie.id, title: movie.title }))
  const playing = dayMovies.find((movie) => movie.id === movieId) ?? null
  const notPlaying = movieId !== null && !playing ? await getMovie(movieId) : null
  const selectedMovie = playing ?? (notPlaying ? { id: notPlaying.id, title: notPlaying.title } : null)
  const filterMovies = notPlaying && selectedMovie ? [...dayMovies, selectedMovie] : dayMovies
  const showtimes = selectedMovie
    ? schedule.items.filter((showtime) => showtime.movie.id === selectedMovie.id)
    : schedule.items
  const groups = groupShowtimesByMovie(showtimes)
  const day = formatLongDay(schedule.date)

  return (
    <div className="flex flex-col gap-6">
      <DateStrip
        today={today ?? schedule.date}
        selected={schedule.date}
        movieId={selectedMovie?.id ?? null}
        days={SCHEDULE_DAYS}
      />
      {filterMovies.length > 0 ? (
        <MovieFilter movies={filterMovies} selectedId={selectedMovie?.id ?? null} date={date} />
      ) : null}
      <section aria-labelledby="schedule-day" className="flex flex-col gap-4">
        <h2 id="schedule-day" className="text-xl font-semibold tracking-tight">
          {day}
        </h2>
        {groups.length > 0 ? (
          <ScheduleList groups={groups} />
        ) : selectedMovie ? (
          <EmptyState title={`${selectedMovie.title} isn't showing on ${day}.`}>
            <Link href={`/movies/${selectedMovie.id}`} className="text-primary hover:underline">
              See all its showtimes
            </Link>{' '}
            or{' '}
            <Link href={scheduleHref({ date })} className="text-primary hover:underline">
              show every movie
            </Link>
            .
          </EmptyState>
        ) : (
          <EmptyState title={`No showtimes on ${day}.`}>Try another day.</EmptyState>
        )}
      </section>
    </div>
  )
}
