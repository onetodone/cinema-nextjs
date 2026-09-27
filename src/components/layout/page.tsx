import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main id="main" className={cn('mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:py-12', className)}>
      {children}
    </main>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {eyebrow ? <p className="text-sm font-medium tracking-widest text-primary uppercase">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function SectionHeader({ id, title, action }: { id: string; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {action}
    </div>
  )
}

/** A friendly empty state inside a section. */
export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </div>
  )
}
