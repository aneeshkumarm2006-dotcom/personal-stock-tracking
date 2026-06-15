'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MenuIcon } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { links } from '@/components/NavLinks'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const pathname = usePathname()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="sm:hidden"
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Open navigation menu"
          >
            <MenuIcon className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-44">
        {links.map((link) => {
          const isActive =
            pathname === link.href || pathname.startsWith(link.href + '/')
          return (
            <DropdownMenuItem
              key={link.href}
              render={
                <Link
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(isActive && 'bg-muted font-medium')}
                >
                  {link.label}
                </Link>
              }
            />
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
