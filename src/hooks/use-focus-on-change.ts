import { useEffect, useRef, type RefObject } from 'react'

/**
 * Gives focus to the returned ref's element (a heading, with `tabIndex={-1}`) when `key` changes while focus has
 * dropped to the document — because the control that had it went away with the old content, like "Pay" replaced by
 * the payment's outcome, or "Cancel hold" by the canceled booking. Focus the viewer has put anywhere else is left
 * alone, and the first render changes nothing.
 */
export function useFocusOnChange<T extends HTMLElement>(key: unknown): RefObject<T | null> {
  const ref = useRef<T>(null)
  const previous = useRef(key)

  useEffect(() => {
    if (Object.is(previous.current, key)) return
    previous.current = key
    const active = document.activeElement
    if (active === null || active === document.body) ref.current?.focus()
  }, [key])

  return ref
}
