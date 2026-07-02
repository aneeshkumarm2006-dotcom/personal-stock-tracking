import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Nav } from '@/components/Nav'
import { Toaster } from '@/components/ui/sonner'
import { NotificationBanner } from '@/components/NotificationBanner'
import { PushRegistrar } from '@/components/PushRegistrar'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Stock Tracker',
  description: 'Personal stock portfolio tracker and strategy manager',
  manifest: '/manifest.webmanifest',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          data-* attributes onto <body> before hydration, causing a harmless
          attribute mismatch. This suppresses that warning for <body> only. */}
      <body
        className="bg-background text-foreground flex min-h-full flex-col"
        suppressHydrationWarning
      >
        <QueryProvider>
          <NotificationBanner />
          <PushRegistrar />
          <Nav />
          <main className="flex flex-1 flex-col">{children}</main>
          <Toaster richColors position="bottom-right" />
        </QueryProvider>
      </body>
    </html>
  )
}
