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

// Only ever holds a *settled* fetch (ready with data, or error). "Loading" is
// derived at render time — a selected instrument with no settled quote for its
// token yet — so the effect never has to setState synchronously.
type QuoteResult =
  | { token: string; ok: true; data: QuoteData }
  | { token: string; ok: false }

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
  const [quote, setQuote] = useState<QuoteResult | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Tracks the most recently requested quote so a slow response for a previously
  // selected stock can't overwrite the quote of the one now selected.
  const quoteRequestRef = useRef<string | null>(null)

  const selectedToken = value?.token ?? null

  const lastTokenRef = useRef<string | null>(selectedToken)
  if (lastTokenRef.current !== selectedToken) {
    lastTokenRef.current = selectedToken
    // Selection changed from outside (e.g. form reset): sync the visible text.
    // The quote itself is (re)fetched by the token-keyed effect below.
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

  // Fetch a live quote whenever a concrete instrument is selected — keyed on the
  // token so it fires once per selection and, crucially, also when the instrument
  // arrives pre-filled rather than picked from the dropdown (the per-instrument
  // "Add transaction" card and the edit dialog both open with a token already
  // set). The exchange is resolved server-side from the instrument record, so we
  // don't need to thread it through here.
  useEffect(() => {
    if (!selectedToken) {
      quoteRequestRef.current = null
      return
    }
    const token = selectedToken
    quoteRequestRef.current = token
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/quote?token=${encodeURIComponent(token)}`, {
          credentials: 'include',
        })
        // A newer selection superseded this request, or the effect was cleaned up.
        if (cancelled || quoteRequestRef.current !== token) return
        if (!res.ok) {
          setQuote({ token, ok: false })
          return
        }
        const data = (await res.json()) as QuoteData
        if (cancelled || quoteRequestRef.current !== token) return
        setQuote({ token, ok: true, data })
      } catch {
        if (cancelled || quoteRequestRef.current !== token) return
        setQuote({ token, ok: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedToken])

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
      {value && (
        <QuotePanel
          result={quote && quote.token === value.token ? quote : null}
        />
      )}
    </div>
  )
}

// `result` is the settled quote for the current selection, or null while the
// fetch is still in flight (or superseded) — which renders as "Fetching…".
function QuotePanel({ result }: { result: QuoteResult | null }) {
  if (!result) {
    return (
      <p className="text-muted-foreground mt-2 text-xs">Fetching live price…</p>
    )
  }

  if (!result.ok) {
    return (
      <p className="text-muted-foreground mt-2 text-xs">
        Couldn&apos;t load the current price.
      </p>
    )
  }

  const { ltp, netChange, pctChange, fetchedAt } = result.data
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
