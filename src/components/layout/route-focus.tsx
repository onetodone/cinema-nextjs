'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/** How long after a navigation the page's heading is waited for (it may stream in behind a skeleton). */
const HEADING_WAIT_MS = 5_000

/**
 * Moves focus to the new page's main heading after a client-side navigation, as a full page load would reset it.
 * Keyboard and screen-reader users then go on from the top of the new content — not from a header link, and not from
 * the start of the document, where focus drops when the link that was used goes away with the old page. Next's route
 * announcer still reads the new title.
 *
 * Only a new pathname counts: `?date=` or `?movie=` changes keep focus on the control that made them.
 */
export function RouteFocus() {
  const pathname = usePathname()
  const previous = useRef(pathname)

  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    return focusPageHeading()
  }, [pathname])

  return null
}

/**
 * Focuses the visible `main h1` now, or once it appears: a loading skeleton may come first, and a heading focused
 * there may be replaced by the page's own. Stops as soon as the viewer moves focus themselves, or after a few seconds.
 */
export function focusPageHeading(): () => void {
  const origin = document.activeElement
  let focused: HTMLElement | null = null

  function place() {
    const active = document.activeElement
    const untouched = active === null || active === document.body || active === origin || active === focused
    if (!untouched) {
      stop()
      return
    }
    // Next keeps recently visited pages mounted but hidden: the heading wanted is the one on screen.
    const heading = Array.from(document.querySelectorAll<HTMLElement>('main h1')).find(isRendered)
    if (!heading || heading === active) return
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
    // The router has already put the scroll position where it belongs.
    heading.focus({ preventScroll: true })
    focused = heading
  }

  const observer = new MutationObserver(place)
  const timer = window.setTimeout(stop, HEADING_WAIT_MS)
  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
  }

  observer.observe(document.body, { childList: true, subtree: true })
  place()
  return stop
}

/** Not inside a hidden page (`display: none`). Browsers without `checkVisibility` get the first heading. */
function isRendered(element: HTMLElement): boolean {
  return typeof element.checkVisibility === 'function' ? element.checkVisibility() : true
}
