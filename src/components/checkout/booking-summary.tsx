import { CalendarIcon, ClockIcon, MapPinIcon } from 'lucide-react'
import type { Booking } from '@/lib/api/types'
import { formatMoney } from '@/lib/money'
import { SEAT_TYPE_LABEL } from '@/lib/seat-map'
import { formatLongDay, formatShowtime, localDateOf } from '@/lib/time'
import { movieMeta } from '@/components/catalog/movie-card'
import { cn } from '@/lib/utils'

/** When and where: the day, the time (the cinema's wall clock), the hall, and the movie's rating and length. */
export function ShowtimeFacts({ showtime }: { showtime: Booking['showtime'] }) {
  return (
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
  )
}

/** Each seat with the price it was booked for, and the API's total (never summed here). */
export function SeatPriceList({ booking, className }: { booking: Booking; className?: string }) {
  const { seats, currency } = booking
  return (
    <dl className={cn('flex flex-col divide-y rounded-xl border text-sm', className)}>
      {seats.map((seat) => (
        <div key={seat.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt>
            Row {seat.row}, seat {seat.number}
            {seat.type !== 'standard' ? (
              <span className="text-muted-foreground"> · {SEAT_TYPE_LABEL[seat.type]}</span>
            ) : null}
          </dt>
          <dd className="tabular-nums">{formatMoney(seat.price_cents, currency)}</dd>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 rounded-b-xl bg-muted/40 px-4 py-3 font-medium">
        <dt>
          Total · {seats.length} {seats.length === 1 ? 'seat' : 'seats'}
        </dt>
        <dd className="text-base tabular-nums">{formatMoney(booking.total_cents, currency)}</dd>
      </div>
    </dl>
  )
}

/** What a booking is for: the movie, when and where, and the seats with their prices. */
export function BookingSummary({ booking, className }: { booking: Booking; className?: string }) {
  const titleId = `booking-${booking.id}-title`
  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="text-xl font-semibold tracking-tight text-balance">
          {booking.showtime.movie.title}
        </h2>
        <ShowtimeFacts showtime={booking.showtime} />
      </div>
      <SeatPriceList booking={booking} />
    </section>
  )
}
