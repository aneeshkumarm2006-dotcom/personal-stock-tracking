'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'

export type InstrumentResult = {
  token: string
  symbol: string
  name: string
  exchange: 'NSE' | 'BSE'
}

export type InstrumentTypeaheadProps = {
  value: { token: string; symbol: string } | null
  onChange: (selected: InstrumentResult | null) => void
  disabled?: boolean
  placeholder?: string
}

export function InstrumentTypeahead({
  value,
  onChange,
  disabled,
  placeholder = 'Search instrument (e.g. SBIN)',
}: InstrumentTypeaheadProps) {
  const listId = useId()
  const [query, setQuery] = useState(value?.symbol ?? '')
  const [results, setResults] = useState<InstrumentResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const lastTokenRef = useRef<string | null>(value?.token ?? null)
  if (lastTokenRef.current !== (value?.token ?? null)) {
    lastTokenRef.current = value?.token ?? null
    setQuery(value?.symbol ?? '')
  }

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    const q = query.trim()
    let cancelled = false

    if (q.length < 2) {
      const clearHandle = setTimeout(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
      }, 0)
      return () => {
        cancelled = true
        clearTimeout(clearHandle)
      }
    }

    const handle = setTimeout(async () => {
      if (cancelled) return
      setLoading(true)
      try {
        const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}`, {
          credentials: 'include',
        })
        if (cancelled) return
        if (!res.ok) {
          setResults([])
        } else {
          const data = (await res.json()) as InstrumentResult[]
          if (!cancelled) setResults(Array.isArray(data) ? data : [])
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

  function handleSelect(result: InstrumentResult) {
    onChange(result)
    setQuery(result.symbol)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          if (value) onChange(null)
        }}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true)
        }}
      />
      {open && (loading || results.length > 0 || query.trim().length >= 2) && (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-lg p-1 shadow-lg ring-1"
        >
          {loading && (
            <li className="text-muted-foreground px-2 py-1.5 text-xs">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="text-muted-foreground px-2 py-1.5 text-xs">
              No instruments found.
            </li>
          )}
          {!loading &&
            results.map((r) => (
              <li key={`${r.exchange}-${r.token}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                  onClick={() => handleSelect(r)}
                >
                  <span className="font-medium">{r.symbol}</span>
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
