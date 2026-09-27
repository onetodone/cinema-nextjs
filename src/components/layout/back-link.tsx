import Link from 'next/link'
import { ChevronLeftIcon } from 'lucide-react'

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md py-1 pr-2 pl-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ChevronLeftIcon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  )
}
