import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Movie, MovieList } from '@/lib/api/types'
import { MOVIES_PAGE_SIZE } from '@/lib/catalog'
import { renderWithQueryClient } from '@/test/query'
import { MovieBrowser } from '@/components/catalog/movie-browser'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function movie(id: number): Movie {
  return { id, title: `Movie ${id}`, duration_min: 90 + id, age_rating: 'PG' }
}

const firstPage: MovieList = { items: [movie(1), movie(2)], next_cursor: 'page-2' }

describe('MovieBrowser', () => {
  it('renders the server page without fetching it again', () => {
    renderWithQueryClient(<MovieBrowser firstPage={{ items: [movie(1)] }} />)

    expect(screen.getByRole('link', { name: /Movie 1/ })).toHaveAttribute('href', '/movies/1')
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })

  it('loads the next page with the cursor and moves focus to the first new movie', async () => {
    const requests: URL[] = []
    server.use(
      http.get('*/v1/movies', ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json({ items: [movie(3), movie(4)] } satisfies MovieList)
      }),
    )
    const user = userEvent.setup()
    renderWithQueryClient(<MovieBrowser firstPage={firstPage} />)

    await user.click(screen.getByRole('button', { name: 'Load more movies' }))

    expect(await screen.findByRole('link', { name: /Movie 4/ })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0].searchParams.get('cursor')).toBe('page-2')
    expect(requests[0].searchParams.get('limit')).toBe(String(MOVIES_PAGE_SIZE))
    expect(screen.getByRole('link', { name: /Movie 3/ })).toHaveFocus()
    // The last page has no cursor: the button goes away.
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })

  it('keeps the loaded movies and reports a failed load', async () => {
    server.use(http.get('*/v1/movies', () => HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })))
    const user = userEvent.setup()
    renderWithQueryClient(<MovieBrowser firstPage={firstPage} />)

    await user.click(screen.getByRole('button', { name: 'Load more movies' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load more movies.")
    expect(screen.getByRole('link', { name: /Movie 2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more movies' })).toBeEnabled()
  })
})
