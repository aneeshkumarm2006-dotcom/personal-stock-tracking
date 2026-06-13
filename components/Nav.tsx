import Link from 'next/link'
import { TrendingUp } from 'lucide-react'

import { NavLinks } from '@/components/NavLinks'
import { MarketStatusBadge } from '@/components/MarketStatusBadge'
import { RefreshButton } from '@/components/RefreshButton'

export function Nav() {
  return (
    <header className="bg-background/85 supports-backdrop-filter:backdrop-blur sticky top-0 z-40 w-full border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-5">
          <Link
            href="/portfolio"
            className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <TrendingUp className="size-3.5" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">Stock Tracker</span>
          </Link>
          <NavLinks />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <MarketStatusBadge />
          <RefreshButton />
        </div>
      </div>
    </header>
  )
}
