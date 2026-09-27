'use client'

import { useEffect } from 'react'

// Replaces the root layout, so it cannot rely on globals.css or the theme provider: plain inline styles that follow
// the system colour scheme.
const styles = `
  :root { color-scheme: dark light; --bg: #100f15; --fg: #f7f7fa; --muted: #a3a1ad; --btn-bg: #fbbf24; --btn-fg: #1c1408; }
  @media (prefers-color-scheme: light) {
    :root { --bg: #fdfcf9; --fg: #1d1a16; --muted: #6b665e; --btn-bg: #f59e0b; --btn-fg: #1c1408; }
  }
  body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 16px; text-align: center; background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  h1 { margin: 0; font-size: 24px; font-weight: 600; }
  p { margin: 0; max-width: 340px; font-size: 14px; color: var(--muted); }
  button { appearance: none; border: 0; border-radius: 8px; padding: 8px 16px; font: inherit; font-size: 14px;
    font-weight: 500; color: var(--btn-fg); background: var(--btn-bg); cursor: pointer; }
`

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
        <style>{styles}</style>
      </head>
      <body>
        <h1>Something went wrong</h1>
        <p>The page failed to load. Try again, or refresh.</p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </body>
    </html>
  )
}
