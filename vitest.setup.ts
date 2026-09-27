import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no matchMedia; next-themes and responsive components call it. Nothing matches by default.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// Testing Library unmounts after each test by itself only when the runner exposes a global `afterEach`; Vitest
// does not (globals are off), so do it here.
afterEach(() => {
  cleanup()
})
