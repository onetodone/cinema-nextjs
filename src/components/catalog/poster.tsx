import Image from 'next/image'
import { FilmIcon } from 'lucide-react'
import type { Movie } from '@/lib/api/types'
import { cn } from '@/lib/utils'

/** FNV-1a: a small, stable string hash, so a movie keeps its colours across renders and builds. */
function hash(value: string): number {
  let result = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 0x01000193)
  }
  return result >>> 0
}

/** A two-hue gradient derived from the movie's id and title. */
export function posterGradient(id: number, title: string): string {
  const seed = hash(`${id}:${title}`)
  const hue = seed % 360
  const second = (hue + 40 + ((seed >>> 9) % 100)) % 360
  return `linear-gradient(155deg, oklch(0.56 0.13 ${hue}) 0%, oklch(0.33 0.1 ${second}) 58%, oklch(0.17 0.04 ${second}) 100%)`
}

interface PosterProps {
  movie: Pick<Movie, 'id' | 'title' | 'poster_url'>
  /** Rendered width hint for the browser (the image is not resized: poster hosts are arbitrary). */
  sizes?: string
  /** Preload with high priority: the poster may be the page's largest image. Implies `eager`. */
  priority?: boolean
  /** Load at once rather than when scrolled near: the poster is above the fold. */
  eager?: boolean
  className?: string
}

/**
 * A 2:3 movie poster over a designed fallback. The frame has a fixed aspect ratio, so nothing shifts while the image
 * loads. The image is decorative (the title is always next to it), so its alt text is empty — which also makes a
 * broken image render as nothing, letting the fallback show through without any client code.
 */
export function Poster({
  movie,
  sizes = '(min-width: 640px) 240px, 50vw',
  priority = false,
  eager = priority,
  className,
}: PosterProps) {
  return (
    <div
      className={cn(
        '@container relative aspect-2/3 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex flex-col justify-between p-[8cqw] text-white"
        style={{ backgroundImage: posterGradient(movie.id, movie.title) }}
      >
        <FilmIcon className="size-[12cqw] opacity-60" />
        <span className="line-clamp-4 text-[11cqw] leading-tight font-semibold tracking-tight text-balance drop-shadow-sm">
          {movie.title}
        </span>
      </div>
      {movie.poster_url ? (
        <Image
          src={movie.poster_url}
          alt=""
          fill
          unoptimized
          sizes={sizes}
          preload={priority}
          loading={eager ? 'eager' : 'lazy'}
          className="object-cover"
        />
      ) : null}
    </div>
  )
}
