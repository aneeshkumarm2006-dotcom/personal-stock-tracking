import Link from 'next/link'
import { NavLinks } from '@/components/NavLinks'
import { MarketStatusBadge } from '@/components/MarketStatusBadge'
import { RefreshButton } from '@/components/RefreshButton'

export function Nav() {
  return (
    <header className="bg-background sticky top-0 z-40 w-full border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/portfolio" className="text-base font-semibold tracking-tight">
            Stock Tracker
          </Link>
          <NavLinks />
        </div>
        <div className="flex items-center gap-3">
          <MarketStatusBadge />
          <RefreshButton />
        </div>
      </div>
    </header>
  )
}
