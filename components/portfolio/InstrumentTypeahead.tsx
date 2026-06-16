'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { formatCurrency, formatIstTime, formatPercent, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'

export type InstrumentResult = {
  token: string
  symbol: string
  name: string
  exchange: 'NSE' | 'BSE'
}

type QuoteData = {
  ltp?: number
  close?: number
  netChange?: number
  pctChange?: number
  fetchedAt?: string
}

type QuoteState = {
  token: string
  status: 'loading' | 'ready' | 'error'
  data: QuoteData | null
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
  const [quote, setQuote] = useState<QuoteState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Tracks the most recently requested quote so a slow response for a previously
  // selected stock can't overwrite the quote of the one now selected.
  const quoteRequestRef = useRef<string | null>(null)

  const lastTokenRef = useRef<string | null>(value?.token ?? null)
  if (lastTokenRef.current !== (value?.token ?? null)) {
    lastTokenRef.current = value?.token ?? null
    setQuery(value?.symbol ?? '')
    // Selection changed from outside (e.g. form reset): drop any stale quote.
    // A late in-flight response is harmless — the panel only renders when the
    // quote's token matches the current selection.
    if (!value) setQuote(null)
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
    void fetchQuote(result)
  }

  async function fetchQuote(result: InstrumentResult) {
    quoteRequestRef.current = result.token
    setQuote({ token: result.token, status: 'loading', data: null })
    try {
      const res = await fetch(
        `/api/quote?token=${encodeURIComponent(result.token)}&exchange=${result.exchange}`,
        { credentials: 'include' },
      )
      // A newer selection superseded this request: ignore the late response.
      if (quoteRequestRef.current !== result.token) return
      if (!res.ok) {
        setQuote({ token: result.token, status: 'error', data: null })
        return
      }
      const data = (await res.json()) as QuoteData
      if (quoteRequestRef.current !== result.token) return
      setQuote({ token: result.token, status: 'ready', data })
    } catch {
      if (quoteRequestRef.current !== result.token) return
      setQuote({ token: result.token, status: 'error', data: null })
    }
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
      {value && quote && quote.token === value.token && (
        <QuotePanel quote={quote} />
      )}
    </div>
  )
}

function QuotePanel({ quote }: { quote: QuoteState }) {
  if (quote.status === 'loading') {
    return (
      <p className="text-muted-foreground mt-2 text-xs">Fetching live price…</p>
    )
  }

  if (quote.status === 'error') {
    return (
      <p className="text-muted-foreground mt-2 text-xs">
        Couldn&apos;t load the current price.
      </p>
    )
  }

  const { ltp, netChange, pctChange, fetchedAt } = quote.data ?? {}
  if (ltp === undefined) {
    return (
      <p className="text-muted-foreground mt-2 text-xs">
        No live price available.
      </p>
    )
  }

  const change = netChange ?? 0
  const changeSign = change > 0 ? '+' : ''

  return (
    <div className="bg-muted/40 ring-foreground/10 mt-2 flex items-baseline justify-between gap-2 rounded-lg px-3 py-2 ring-1">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(ltp)}
        </span>
        <span className={cn('text-xs tabular-nums', pnlColorClass(change))}>
          {changeSign}
          {formatCurrency(change)} ({formatPercent(pctChange)})
        </span>
      </div>
      {fetchedAt && (
        <span className="text-muted-foreground text-[10px]">
          {formatIstTime(fetchedAt)}
        </span>
      )}
    </div>
  )
}
