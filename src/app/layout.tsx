import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { SessionExpiryListener } from '@/components/auth/session-expiry-listener'
import { BookingSyncListener } from '@/components/providers/booking-sync'
import { RouteFocus } from '@/components/layout/route-focus'
import { AuthProvider } from '@/lib/auth/context'
import { Toaster } from '@/components/ui/sonner'
import { APP_DESCRIPTION, APP_NAME, APP_URL } from '@/lib/site'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfcf9' },
    { media: '(prefers-color-scheme: dark)', color: '#100f15' },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              {children}
              <SessionExpiryListener />
              <BookingSyncListener />
              {/* The pathname of a dynamic route is unknown while prerendering. */}
              <Suspense fallback={null}>
                <RouteFocus />
              </Suspense>
            </AuthProvider>
          </QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
