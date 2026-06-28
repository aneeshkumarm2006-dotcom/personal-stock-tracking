'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { SelectedInstrument } from './types'

type SearchResult = {
  token: string
  symbol: string
  name: string
  exchange: 'NSE' | 'BSE'
}

export type ResearchSearchProps = {
  onSelect: (instrument: SelectedInstrument) => void
  autoFocus?: boolean
  placeholder?: string
}

// The research page's primary search: type a symbol or company name, pick a
// result, and the page loads everything we can pull for it. Debounced against
// /api/instruments/search (the same scrip-master index the typeahead uses), with
// arrow-key + Enter navigation.
export function ResearchSearch({
  onSelect,
  autoFocus,
  placeholder = 'Search any stock — e.g. RELIANCE, "state bank", INFY',
}: ResearchSearchProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Keep the keyboard-highlighted option visible as it moves past the fold.
  useEffect(() => {
    if (!open) return
    document
      .getElementById(`${listId}-opt-${active}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, open, listId])

  useEffect(() => {
    const q = query.trim()
    let cancelled = false

    if (q.length < 2) {
      // Defer the clear to a macrotask so it isn't a synchronous setState in the
      // effect body (mirrors InstrumentTypeahead).
      const clear = setTimeout(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
      }, 0)
      return () => {
        cancelled = true
        clearTimeout(clear)
      }
    }

    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/instruments/search?q=${encodeURIComponent(q)}`,
          { credentials: 'include' },
        )
        if (cancelled) return
        const data = res.ok ? ((await res.json()) as SearchResult[]) : []
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : [])
          setActive(0)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  function choose(result: SearchResult) {
    onSelect(result)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const picked = results[active]
      if (picked) choose(picked)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <Input
          type="text"
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-label="Search stocks"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results.length > 0 ? `${listId}-opt-${active}` : undefined
          }
          className="h-11 pl-9 text-base"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (loading || results.length > 0 || query.trim().length >= 2) && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1.5 max-h-80 w-full overflow-auto rounded-lg p-1 shadow-lg ring-1"
        >
          {loading && (
            <li className="text-muted-foreground px-2.5 py-2 text-sm">
              Searching…
            </li>
          )}
          {!loading && results.length === 0 && (
            <li className="text-muted-foreground px-2.5 py-2 text-sm">
              No instruments found.
            </li>
          )}
          {!loading &&
            results.map((r, i) => (
              <li
                key={`${r.exchange}-${r.token}`}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
              >
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors',
                    i === active ? 'bg-muted' : 'hover:bg-muted/60',
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r)}
                >
                  <span className="truncate text-sm font-medium">{r.symbol}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {r.name} · {r.exchange}
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
