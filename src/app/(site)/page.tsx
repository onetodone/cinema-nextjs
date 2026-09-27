import { ClapperboardIcon, ArmchairIcon, TicketIcon } from 'lucide-react'
import { APP_DESCRIPTION } from '@/lib/site'

const steps = [
  { icon: ClapperboardIcon, title: 'Pick a showtime', text: 'Browse what is showing and the day schedule.' },
  { icon: ArmchairIcon, title: 'Choose your seats', text: 'A live seat map holds them for 15 minutes.' },
  { icon: TicketIcon, title: 'Pay and go', text: 'Your ticket, with a QR code, is ready at once.' },
]

// Placeholder home until the catalog lands (Sprint 1): proves the theme, fonts, and layout render.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-12 sm:py-20">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-medium tracking-widest text-primary uppercase">Now showing soon</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Your seat is waiting.
        </h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{APP_DESCRIPTION}</p>
      </section>
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-card-foreground">
            <Icon className="size-6 text-primary" aria-hidden="true" />
            <h2 className="font-medium">
              <span className="sr-only">Step {index + 1}: </span>
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
