import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TONE_CLASS = {
  default: 'bg-muted/50',
  highlight: 'border-primary/40 bg-primary/10',
  destructive: 'border-destructive/40 bg-destructive/10',
} as const

const ICON_CLASS = {
  default: '',
  highlight: 'text-primary',
  destructive: 'text-destructive',
} as const

/**
 * A boxed message about the state of the page (a canceled showtime, seats you hold, a declined card), with optional
 * actions. `role` is `status` by default: pass `alert` for failures the viewer should hear at once, or `none` for a
 * notice that is there from the start and needs no announcement.
 */
export function Notice({
  tone = 'default',
  icon: Icon,
  title,
  children,
  actions,
  role = 'status',
  className,
}: {
  tone?: keyof typeof TONE_CLASS
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  role?: 'status' | 'alert' | 'none'
  className?: string
}) {
  return (
    <div
      role={role === 'none' ? undefined : role}
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center',
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon className={cn('mt-0.5 size-4 shrink-0', ICON_CLASS[tone])} aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-medium">{title}</p>
          {children ? <div className="text-muted-foreground">{children}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 pl-7 sm:pl-0">{actions}</div> : null}
    </div>
  )
}
