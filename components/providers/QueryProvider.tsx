'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is fresh for a minute; within that window remounts and
            // navigations read from cache instead of refetching.
            staleTime: 60_000,
            // Polling is opt-in per query, NOT a global default. Live surfaces
            // (portfolio/watchlist/strategy price pollers, NotificationBanner)
            // set their own refetchInterval and invalidate the tables they feed.
            // Everything else changes only on a user action or the daily cron, so
            // a mount fetch + targeted invalidation keeps it current without a
            // 30s background poll hammering every expensive endpoint on every
            // open tab.
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  )
}
