'use client'

import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatInt, pnlColorClass } from '@/lib/format'
import type { EntryStats } from '@/lib/strategy/group'
import { ManualCloseDialog } from './ManualCloseDialog'

export type EntriesTableProps = {
  groupId: string
  entries: EntryStats[]
  allowClose?: boolean
}

type StatusDisplay = {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
}

function statusDisplay(entry: EntryStats): StatusDisplay {
  switch (entry.status) {
    case 'pending':
      return { label: 'Waiting for entry', variant: 'outline' }
    case 'active': {
      if (entry.currentPrice === null) {
        return { label: 'Running', variant: 'secondary' }
      }
      const pct =
        entry.capitalUsed > 0 ? (entry.unrealizedPnL / entry.capitalUsed) * 100 : 0
      const sign = pct >= 0 ? '+' : ''
      return {
        label: `Running ${sign}${pct.toFixed(2)}%`,
        variant: 'secondary',
        className: pct >= 0 ? 'text-emerald-500' : 'text-red-500',
      }
    }
    case 'tp_hit':
      return {
        label: 'TP HIT',
        variant: 'default',
        className: 'bg-emerald-600 text-white',
      }
    case 'sl_hit':
      return { label: 'SL HIT', variant: 'destructive' }
    case 'closed_manual':
      return { label: 'Closed', variant: 'outline' }
    default:
      return { label: entry.status, variant: 'outline' }
  }
}

export function EntriesTable({ groupId, entries, allowClose = true }: EntriesTableProps) {
  const [closing, setClosing] = useState<EntryStats | null>(null)

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No entries yet. Add one to start tracking trade ideas in this group.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Entry</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead className="text-right">TP</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="text-right">Risk</TableHead>
              <TableHead className="text-right">Reward</TableHead>
              <TableHead className="text-right">R:R</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              {allowClose && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => {
              const display = statusDisplay(e)
              const canClose = e.status === 'pending' || e.status === 'active'
              const key = e.id ?? `${e.instrumentToken}-${e.entryPrice}`
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {e.instrumentSymbol || e.instrumentToken}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.entryPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.stopLoss)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.targetPrice)}</TableCell>
                  <TableCell className="text-right">{formatInt(e.quantity)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.capitalUsed)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.risk)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(e.reward)}</TableCell>
                  <TableCell className="text-right">
                    {e.rr > 0 ? e.rr.toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(e.currentPrice)}</TableCell>
                  <TableCell>
                    <Badge variant={display.variant} className={display.className}>
                      {display.label}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right ${pnlColorClass(e.unrealizedPnL)}`}>
                    {e.status === 'active' ? formatCurrency(e.unrealizedPnL) : '—'}
                  </TableCell>
                  {allowClose && (
                    <TableCell className="text-right">
                      {canClose && e.id ? (
                        <Button size="xs" variant="outline" onClick={() => setClosing(e)}>
                          Close
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {closing && closing.id && (
        <ManualCloseDialog
          entryId={closing.id}
          groupId={groupId}
          symbol={closing.instrumentSymbol || closing.instrumentToken}
          currentPrice={closing.currentPrice}
          onClose={() => setClosing(null)}
        />
      )}
    </div>
  )
}
