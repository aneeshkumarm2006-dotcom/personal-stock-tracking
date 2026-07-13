'use client'

import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import { patternLabel, tierLabel, tierTone } from '@/lib/scanner/patternMeta'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  PatternCohortBlock,
  PatternStatsSummary,
} from '@/lib/scanner/types'

const MIN_FILLS_FOR_VERDICT = 30

type Cohort = 'tradable' | 'untradable'

function fmtPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function fmtR(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value.toFixed(2)}R`
}

// Tier 2 buckets rank above Tier 4; within a tier, more fills first.
function tierRank(tier: string | null): number {
  if (tier === 'tier2') return 0
  if (tier === 'tier4') return 2
  return 1
}

function StatusBadge({ block }: { block: PatternCohortBlock }) {
  if (block.fills === 0) {
    return <span className="text-muted-foreground text-xs">No fills</span>
  }
  if (block.status === 'ready') {
    return (
      <Badge
        variant="outline"
        className="bg-gain/10 text-gain border-transparent text-xs"
      >
        Verdict ready
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground text-xs">
      Accumulating {block.fills}/{MIN_FILLS_FOR_VERDICT}
    </Badge>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function PatternScoreboard({
  summary,
}: {
  summary: PatternStatsSummary | null
}) {
  const [cohort, setCohort] = useState<Cohort>('tradable')

  const rows = useMemo(() => {
    const buckets = summary?.buckets ?? []
    const withBlock = buckets.map((b) => ({ bucket: b, block: b[cohort] }))
    return withBlock.sort((a, b) => {
      const tr = tierRank(a.bucket.tier) - tierRank(b.bucket.tier)
      if (tr !== 0) return tr
      if (a.block.fills !== b.block.fills) return b.block.fills - a.block.fills
      return a.bucket.key < b.bucket.key ? -1 : 1
    })
  }, [summary, cohort])

  const totalFills = useMemo(
    () => rows.reduce((sum, r) => sum + r.block.fills, 0),
    [rows],
  )

  if (!summary || summary.buckets.length === 0) {
    return (
      <div className="bg-muted/30 ring-foreground/10 rounded-lg px-4 py-3.5 ring-1">
        <p className="text-sm font-medium">Scoreboard is still filling up</p>
        <p className="text-muted-foreground mt-1 text-sm">
          A pattern only earns a row here once its first paper trade{' '}
          <span className="text-foreground">enters and closes</span>. Detections
          land daily (see below), but a pattern needs about{' '}
          <span className="tabular-nums">{MIN_FILLS_FOR_VERDICT}</span>{' '}
          closed trades before its win rate and P&amp;L mean anything — so this
          settles over weeks, not days.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted inline-flex items-center gap-1 rounded-lg p-[3px]">
          <ToggleButton
            active={cohort === 'tradable'}
            onClick={() => setCohort('tradable')}
          >
            Tradable
          </ToggleButton>
          <ToggleButton
            active={cohort === 'untradable'}
            onClick={() => setCohort('untradable')}
          >
            Untradable
          </ToggleButton>
        </div>
        <p className="text-muted-foreground text-xs">
          {formatInt(totalFills)} {cohort} trades across{' '}
          {summary.buckets.length} pattern
          {summary.buckets.length === 1 ? '' : 's'}
          {summary.asOf ? ` · as of ${summary.asOf}` : ''}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table containerClassName="thin-scrollbar">
          <TableHeader>
            <TableRow>
              <TableHead>Pattern</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Win rate</TableHead>
              <TableHead className="text-right">Avg R</TableHead>
              <TableHead className="text-right">Net P&amp;L</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ bucket, block }) => {
              const tl = tierLabel(bucket.tier)
              return (
                <TableRow key={bucket.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {patternLabel(bucket.key)}
                      </span>
                      {tl ? (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            tierTone(bucket.tier),
                          )}
                        >
                          {tl}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground font-mono text-[11px]">
                      {bucket.key}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {block.fills > 0 ? (
                      <span>
                        {formatInt(block.fills)}
                        <span className="text-muted-foreground text-xs">
                          {' '}
                          ({block.closedTrades}c/{block.openTrades}o)
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtPct(block.winRate)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      pnlColorClass(block.avgR),
                    )}
                  >
                    {fmtR(block.avgR)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      pnlColorClass(block.totalRealizedNet),
                    )}
                  >
                    {formatCurrency(block.totalRealizedNet)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge block={block} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-muted-foreground text-xs">
        A pattern earns a keep / tune / kill verdict once it reaches ~
        {MIN_FILLS_FOR_VERDICT} closed trades. Win rate, expectancy and avg R
        count closed trades only. Tradable and untradable names (illiquid, or
        under NSE surveillance / trade-to-trade rules) are never mixed — flip the
        toggle to inspect the untradable long tail on its own.
      </p>
    </div>
  )
}
