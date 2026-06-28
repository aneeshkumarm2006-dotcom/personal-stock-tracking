'use client'

import Link from 'next/link'
import { ArrowUpRightIcon, BellPlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AddToWatchlistDialog } from '@/components/watchlist/AddToWatchlistDialog'
import { formatCurrency, formatIstTime, formatPercent, pnlColorClass } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Quote, SelectedInstrument } from './types'

export type QuoteHeaderProps = {
  instrument: SelectedInstrument
  quote: Quote | undefined
  marketOpen: boolean
  isFetching: boolean
  isError: boolean
}

export function QuoteHeader({
  instrument,
  quote,
  marketOpen,
  isFetching,
  isError,
}: QuoteHeaderProps) {
  const ltp = quote?.ltp
  // Prefer the exchange-reported change; fall back to LTP − previous close.
  const netChange =
    quote?.netChange ??
    (ltp !== undefined && quote?.close !== undefined ? ltp - quote.close : undefined)
  const pctChange =
    quote?.pctChange ??
    (netChange !== undefined && quote?.close
      ? (netChange / quote.close) * 100
      : undefined)
  const changeSign = (netChange ?? 0) > 0 ? '+' : ''

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {instrument.symbol}
          </h1>
          <span className="text-muted-foreground truncate text-sm">
            {instrument.name}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {instrument.exchange} · Token {instrument.token}
        </p>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-1">
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(ltp)}
          </span>
          {netChange !== undefined && (
            <span
              className={cn(
                'text-sm font-medium tabular-nums',
                pnlColorClass(netChange),
              )}
            >
              {changeSign}
              {formatCurrency(netChange)} ({formatPercent(pctChange)})
            </span>
          )}
        </div>

        <LiveStatus
          marketOpen={marketOpen}
          isFetching={isFetching}
          isError={isError}
          hasData={quote !== undefined}
          fetchedAt={quote?.fetchedAt}
          exchFeedTime={quote?.exchFeedTime}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <AddToWatchlistDialog
          initial={{
            instrumentToken: instrument.token,
            instrumentSymbol: instrument.symbol,
            exchange: instrument.exchange,
            name: instrument.name,
          }}
          trigger={
            <Button variant="outline" size="sm">
              <BellPlusIcon aria-hidden="true" />
              Add to watchlist
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/portfolio/${encodeURIComponent(instrument.token)}`} />}
        >
          Transactions
          <ArrowUpRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

function LiveStatus({
  marketOpen,
  isFetching,
  isError,
  hasData,
  fetchedAt,
  exchFeedTime,
}: {
  marketOpen: boolean
  isFetching: boolean
  isError: boolean
  hasData: boolean
  fetchedAt: string | undefined
  exchFeedTime: string | undefined
}) {
  // A failed *background* refresh keeps the last good quote on screen (react-query
  // retains data), so only surface a hard error when there's nothing to show.
  const hardError = isError && !hasData
  const softError = isError && hasData

  let label: string
  if (hardError) {
    label = 'Couldn’t reach the data provider'
  } else if (!marketOpen) {
    label = exchFeedTime ? `Market closed · last traded ${exchFeedTime}` : 'Market closed'
  } else if (softError) {
    label = fetchedAt
      ? `Reconnecting… · last updated ${formatIstTime(fetchedAt)}`
      : 'Reconnecting…'
  } else if (isFetching) {
    label = 'Updating live price…'
  } else if (fetchedAt) {
    label = `Live · updated ${formatIstTime(fetchedAt)}`
  } else {
    label = 'Connecting to live prices…'
  }

  return (
    <div className="text-muted-foreground flex items-center gap-2 pt-1 text-xs" aria-live="polite">
      <span
        className={cn(
          'inline-block size-1.5 rounded-full',
          hardError
            ? 'bg-loss'
            : marketOpen
              ? 'bg-gain'
              : 'bg-muted-foreground/40',
          marketOpen && (isFetching || softError) && 'animate-pulse',
        )}
        aria-hidden="true"
      />
      {label}
    </div>
  )
}
