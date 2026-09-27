import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'

export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeader />
      {/* One main landmark for every page: Next keeps up to three visited pages mounted but hidden, so a main per
          page would leave several elements with the id the skip link points to. At least a screen tall (below the
          3.5rem header), so the footer starts below the fold and content that arrives late never pushes it out of
          view. */}
      <main id="main" tabIndex={-1} className="flex min-h-[calc(100svh-3.5rem)] flex-1 flex-col outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
