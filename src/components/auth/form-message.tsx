import { CircleAlertIcon } from 'lucide-react'

/** A form-level error under the fields (field errors show next to their inputs). */
export function FormMessage({ children }: { children?: string }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}
