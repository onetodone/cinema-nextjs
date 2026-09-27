import { APP_NAME } from '@/lib/site'

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>{APP_NAME} — a demo client for the Cinema Booking API.</p>
        <p>Payments use a local test provider; no real money moves.</p>
      </div>
    </footer>
  )
}
