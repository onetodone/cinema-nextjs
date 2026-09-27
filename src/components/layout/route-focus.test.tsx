import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteFocus } from '@/components/layout/route-focus'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

/**
 * A page: the header's link, and a main area with its heading (`null` while a skeleton stands in for it), after the
 * heading of a visited page that Next keeps mounted but hidden (`kept`).
 */
function Page({ heading, kept }: { heading: string | null; kept?: string }) {
  return (
    <>
      <header>
        <a href="#movies">Movies</a>
      </header>
      <main id="main">
        {kept ? (
          <section hidden>
            <h1>{kept}</h1>
          </section>
        ) : null}
        {heading === null ? <p>Loading…</p> : <h1>{heading}</h1>}
        <input aria-label="Search" />
      </main>
      <RouteFocus />
    </>
  )
}

beforeEach(() => {
  navigation.pathname = '/'
})

describe('RouteFocus', () => {
  it('leaves focus alone on the page the visit starts on', () => {
    render(<Page heading="Home" />)
    expect(document.body).toHaveFocus()
  })

  it('moves focus from the link that was used to the new page’s heading', () => {
    const { rerender } = render(<Page heading="Home" />)
    screen.getByRole('link', { name: 'Movies' }).focus()

    navigation.pathname = '/movies'
    rerender(<Page heading="Movies" />)

    const heading = screen.getByRole('heading', { name: 'Movies' })
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
  })

  it('waits for a heading that streams in after a skeleton', async () => {
    const { rerender } = render(<Page heading="Home" />)
    navigation.pathname = '/movies/7'
    rerender(<Page heading={null} />)
    expect(document.body).toHaveFocus()

    rerender(<Page heading="Dune" />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dune' })).toHaveFocus())
  })

  it('leaves focus where the viewer put it meanwhile', async () => {
    const { rerender } = render(<Page heading="Home" />)
    navigation.pathname = '/movies/7'
    rerender(<Page heading={null} />)
    act(() => screen.getByRole('textbox', { name: 'Search' }).focus())

    rerender(<Page heading="Dune" />)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()
  })

  it('skips the headings of visited pages that Next keeps hidden', () => {
    // jsdom has no layout: a heading inside `hidden` counts as not rendered.
    HTMLElement.prototype.checkVisibility = function (this: HTMLElement) {
      return this.closest('[hidden]') === null
    }
    try {
      const { rerender } = render(<Page heading="Home" />)
      navigation.pathname = '/movies'
      rerender(<Page kept="Home" heading="Movies" />)
      expect(screen.getByRole('heading', { name: 'Movies' })).toHaveFocus()
    } finally {
      // @ts-expect-error -- jsdom's own prototype has no such method.
      delete HTMLElement.prototype.checkVisibility
    }
  })

  it('keeps focus on the control that changed only the query string', () => {
    navigation.pathname = '/schedule'
    const { rerender } = render(<Page heading="Schedule" />)
    screen.getByRole('link', { name: 'Movies' }).focus()

    // `?date=` changed: same pathname.
    rerender(<Page heading="Schedule" />)

    expect(screen.getByRole('link', { name: 'Movies' })).toHaveFocus()
  })
})
