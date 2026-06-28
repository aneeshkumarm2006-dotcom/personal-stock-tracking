'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export const links = [
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/strategy', label: 'Strategy' },
  { href: '/research', label: 'Research' },
] as const

export function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className="hidden items-center gap-0.5 sm:flex">
      {links.map((link) => {
        const isActive =
          pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
